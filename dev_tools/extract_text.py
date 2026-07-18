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

# Let's write a function to parse an ObjStm and add its sub-objects
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

# Find page objects
page_objects = []
for obj_id, body in pdf_objects.items():
    if b'/Type/Page' in body or b'/Type /Page' in body:
        if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
            page_objects.append((obj_id, body))

# Sort page objects by ID (which usually aligns with page order)
page_objects.sort(key=lambda x: x[0])

# Helper function to parse text operators from content stream
def extract_text_from_stream(stream_data):
    # Regex to find BT ... ET blocks
    bt_et_blocks = re.findall(rb'BT\s+(.*?)\s+ET', stream_data, re.DOTALL)
    text_pieces = []
    
    for block in bt_et_blocks:
        # Inside BT ... ET, search for Tj, TJ, ', "
        # TJ matches: \[ (.*? ) \] \s* TJ
        # Tj matches: \( (.*? ) \) \s* Tj
        # We also need to handle hex strings like <000E0026> Tj or TJ
        
        # Let's search for tokens. A simple way is to iterate through tokens or regex
        # Tj:
        tjs = re.findall(rb'\((.*?)\)\s*Tj', block)
        for tj in tjs:
            text_pieces.append(tj)
            
        # TJ:
        tjs_array = re.findall(rb'\[(.*?)\]\s*TJ', block)
        for arr in tjs_array:
            # Inside the array, extract strings in parentheses
            strings = re.findall(rb'\((.*?)\)', arr)
            for s in strings:
                text_pieces.append(s)
                
    # Decode text pieces. Bonhoeffer's works are in German, usually encoded in WinAnsiEncoding or MacRoman.
    # WinAnsiEncoding or MacRoman are close to latin1/utf-8, let's decode with latin1 and clean up.
    # Note: octal escapes like \037 or \377 need to be resolved.
    decoded = []
    for piece in text_pieces:
        # Resolve octal escapes in the byte string
        # Python's decode('unicode_escape') can resolve octal escapes, but we have a byte string.
        # Let's write a simple helper to replace octal escapes.
        # An octal escape is backslash followed by 1 to 3 octal digits: \ddd
        def replace_octal(match):
            return bytes([int(match.group(1), 8)])
        
        resolved = re.sub(rb'\\([0-7]{1,3})', replace_octal, piece)
        # Also replace escaped parentheses \( and \)
        resolved = resolved.replace(b'\\(', b'(').replace(b'\\)', b')')
        
        try:
            text_str = resolved.decode('latin-1') # German accents are in latin-1
            decoded.append(text_str)
        except Exception:
            pass
            
    return " ".join(decoded)

# Let's print text for first 25 pages
for idx, (obj_id, page_body) in enumerate(page_objects[:25]):
    # Find Contents
    contents_match = re.search(rb'/Contents\s+(\d+)\s+\d+\s+R', page_body)
    contents_text = ""
    if contents_match:
        content_obj_id = int(contents_match.group(1))
        content_body = pdf_objects.get(content_obj_id)
        if content_body:
            # Content body is a stream
            stream_match = re.search(rb'stream\r?\n(.*)\r?\nendstream', content_body, re.DOTALL)
            if not stream_match:
                stream_match = re.search(rb'stream\n(.*)\nendstream', content_body, re.DOTALL)
            if stream_match:
                stream_data = stream_match.group(1)
                # Check filter
                if b'/FlateDecode' in content_body:
                    try:
                        decompressed = zlib.decompress(stream_data)
                        contents_text = extract_text_from_stream(decompressed)
                    except Exception:
                        pass
                else:
                    contents_text = extract_text_from_stream(stream_data)
    else:
        # Maybe contents is an array of refs
        contents_array_match = re.search(rb'/Contents\s*\[(.*?)\]', page_body)
        if contents_array_match:
            refs = re.findall(rb'(\d+)\s+\d+\s+R', contents_array_match.group(1))
            parts = []
            for ref in refs:
                content_obj_id = int(ref)
                content_body = pdf_objects.get(content_obj_id)
                if content_body:
                    stream_match = re.search(rb'stream\r?\n(.*)\r?\nendstream', content_body, re.DOTALL)
                    if not stream_match:
                        stream_match = re.search(rb'stream\n(.*)\nendstream', content_body, re.DOTALL)
                    if stream_match:
                        stream_data = stream_match.group(1)
                        if b'/FlateDecode' in content_body:
                            try:
                                decompressed = zlib.decompress(stream_data)
                                parts.append(extract_text_from_stream(decompressed))
                            except Exception:
                                pass
                        else:
                            parts.append(extract_text_from_stream(stream_data))
            contents_text = " ".join(parts)

    print(f"\n--- PAGE {idx} (Obj {obj_id}) ---")
    print(contents_text[:300])
