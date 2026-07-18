import re
import zlib

pdf_path = "/Volumes/Photos/AI Studio/dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"

with open(pdf_path, 'rb') as f:
    content = f.read()

# 1. Parse standard objects (that are not in ObjStms)
obj_re = re.compile(rb'(\d+)\s+(\d+)\s+obj\r?\n(.*?)\r?\nendobj', re.DOTALL)
pdf_objects = {}
for m in obj_re.finditer(content):
    obj_id = int(m.group(1))
    gen_id = int(m.group(2))
    obj_body = m.group(3)
    pdf_objects[obj_id] = obj_body

print(f"Parsed {len(pdf_objects)} top-level objects.")

# Let's write a function to parse an ObjStm and add its sub-objects
def parse_obj_stm(obj_id, body):
    # Find headers: Length, Filter, Type, N, First
    n_match = re.search(rb'/N\s+(\d+)', body)
    first_match = re.search(rb'/First\s+(\d+)', body)
    filter_match = re.search(rb'/Filter\s*/(\w+)', body)
    
    if not (n_match and first_match):
        return
        
    N = int(n_match.group(1))
    First = int(first_match.group(1))
    
    # Extract stream content
    stream_match = re.search(rb'stream\r?\n(.*)\r?\nendstream', body, re.DOTALL)
    if not stream_match:
        # Try without \r
        stream_match = re.search(rb'stream\n(.*)\nendstream', body, re.DOTALL)
        
    if not stream_match:
        return
        
    stream_data = stream_match.group(1)
    
    # Decompress
    try:
        decompressed = zlib.decompress(stream_data)
    except Exception as e:
        try:
            decompressed = zlib.decompress(stream_data, -15)
        except Exception as e2:
            print(f"Failed to decompress ObjStm {obj_id}: {e2}")
            return
            
    # The first portion of the decompressed stream contains N pairs of: obj_num offset
    # Let's parse them
    header_part = decompressed[:First].decode('utf-8', errors='ignore')
    tokens = header_part.split()
    if len(tokens) < 2 * N:
        print(f"ObjStm {obj_id}: Header tokens count {len(tokens)} < {2 * N}")
        return
        
    obj_offsets = []
    for i in range(N):
        sub_obj_id = int(tokens[2 * i])
        offset = int(tokens[2 * i + 1])
        obj_offsets.append((sub_obj_id, offset))
        
    # Extract the objects
    data_part = decompressed[First:]
    for i in range(N):
        sub_obj_id, offset = obj_offsets[i]
        # The object extends from offset to the next offset (or end of data)
        start = offset
        if i + 1 < N:
            end = obj_offsets[i + 1][1]
        else:
            end = len(data_part)
            
        sub_obj_body = data_part[start:end]
        pdf_objects[sub_obj_id] = sub_obj_body

# Find and parse all ObjStm
obj_stms = []
for obj_id, body in list(pdf_objects.items()):
    if b'/Type/ObjStm' in body or b'/Type /ObjStm' in body:
        obj_stms.append(obj_id)

print(f"Found {len(obj_stms)} ObjStms. Parsing them...")
for obj_id in obj_stms:
    parse_obj_stm(obj_id, pdf_objects[obj_id])

print(f"Total objects after parsing ObjStms: {len(pdf_objects)}")

# Now check for /Type /Page objects again
page_objects = []
for obj_id, body in pdf_objects.items():
    if b'/Type/Page' in body or b'/Type /Page' in body:
        # Exclude /Pages (plural)
        if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
            page_objects.append((obj_id, body))

print(f"Found {len(page_objects)} Page objects.")
if page_objects:
    page_objects.sort(key=lambda x: x[0])
    for i in range(min(5, len(page_objects))):
        obj_id, body = page_objects[i]
        print(f"Page {i} (Obj {obj_id}): {body[:150]}")
