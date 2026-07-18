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
    pdf_objects[obj_id] = m.group(3)

# Function to parse ObjStms
def parse_obj_stm(obj_id, body):
    n_match = re.search(rb'/N\s+(\d+)', body)
    first_match = re.search(rb'/First\s+(\d+)', body)
    if not (n_match and first_match):
        return
    N = int(n_match.group(1))
    First = int(first_match.group(1))
    stream_match = re.search(rb'stream\r?\n(.*)\r?\nendstream', body, re.DOTALL)
    if not stream_match:
        stream_match = re.search(rb'stream\n(.*)\nendstream', body, re.DOTALL)
    if not stream_match:
        return
    stream_data = stream_match.group(1)
    try:
        decompressed = zlib.decompress(stream_data)
    except Exception:
        try:
            decompressed = zlib.decompress(stream_data, -15)
        except Exception:
            return
    header_part = decompressed[:First].decode('utf-8', errors='ignore')
    tokens = header_part.split()
    if len(tokens) < 2 * N:
        return
    obj_offsets = []
    for i in range(N):
        sub_obj_id = int(tokens[2 * i])
        offset = int(tokens[2 * i + 1])
        obj_offsets.append((sub_obj_id, offset))
    data_part = decompressed[First:]
    for i in range(N):
        sub_obj_id, offset = obj_offsets[i]
        start = offset
        if i + 1 < N:
            end = obj_offsets[i + 1][1]
        else:
            end = len(data_part)
        pdf_objects[sub_obj_id] = data_part[start:end]

# Parse ObjStms
obj_stms = [obj_id for obj_id, body in pdf_objects.items() if b'/Type/ObjStm' in body or b'/Type /ObjStm' in body]
for obj_id in obj_stms:
    parse_obj_stm(obj_id, pdf_objects[obj_id])

print(f"Font Obj 29 body:")
print(pdf_objects.get(29))

print(f"Font Obj 35 body:")
print(pdf_objects.get(35))

# Let's search all objects to see which ones contain '/ToUnicode'
tounicode_objs = []
for obj_id, body in pdf_objects.items():
    if b'/ToUnicode' in body:
        tounicode_objs.append(obj_id)
        
print(f"Found {len(tounicode_objs)} objects containing /ToUnicode: {tounicode_objs}")
if tounicode_objs:
    print(f"First /ToUnicode object body (Obj {tounicode_objs[0]}):")
    print(pdf_objects.get(tounicode_objs[0])[:500])
