import re
import zlib
import sys

def parse_pdf(pdf_path):
    with open(pdf_path, 'rb') as f:
        content = f.read()

    # Parse all top-level objects
    obj_re = re.compile(rb'(\d+)\s+(\d+)\s+obj\r?\n(.*?)\r?\nendobj', re.DOTALL)
    pdf_objects = {}
    for m in obj_re.finditer(content):
        obj_id = int(m.group(1))
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

    obj_stms = [obj_id for obj_id, body in pdf_objects.items() if b'/Type/ObjStm' in body or b'/Type /ObjStm' in body]
    for obj_id in obj_stms:
        parse_obj_stm(obj_id, pdf_objects[obj_id])
        
    return pdf_objects

def parse_cmap(cmap_body):
    # Extract stream if it's an object with stream
    stream_match = re.search(rb'stream\r?\n(.*)\r?\nendstream', cmap_body, re.DOTALL)
    if not stream_match:
        stream_match = re.search(rb'stream\n(.*)\nendstream', cmap_body, re.DOTALL)
    
    if stream_match:
        stream_data = stream_match.group(1)
        try:
            decompressed = zlib.decompress(stream_data)
            cmap_text = decompressed.decode('utf-8', errors='ignore')
        except Exception:
            try:
                decompressed = zlib.decompress(stream_data, -15)
                cmap_text = decompressed.decode('utf-8', errors='ignore')
            except Exception:
                cmap_text = stream_data.decode('utf-8', errors='ignore')
    else:
        cmap_text = cmap_body.decode('utf-8', errors='ignore')
        
    # Now parse cmap_text
    cmap = {}
    
    # Parse beginbfchar ... endbfchar
    bfchar_re = re.compile(r'beginbfchar\s+(.*?)\s+endbfchar', re.DOTALL)
    for bfchar_block in bfchar_re.finditer(cmap_text):
        for line in bfchar_block.group(1).strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            # format: <code_hex> <unicode_hex>
            m = re.match(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', line)
            if m:
                code_hex = m.group(1).lower()
                uni_hex = m.group(2)
                try:
                    # Convert uni_hex to unicode character
                    # uni_hex might represent 1 or more 16-bit unicode characters
                    uni_str = "".join(chr(int(uni_hex[j:j+4], 16)) for j in range(0, len(uni_hex), 4))
                    cmap[code_hex] = uni_str
                except Exception:
                    pass
                    
    # Parse beginbfrange ... endbfrange
    bfrange_re = re.compile(r'beginbfrange\s+(.*?)\s+endbfrange', re.DOTALL)
    for bfrange_block in bfrange_re.finditer(cmap_text):
        for line in bfrange_block.group(1).strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            # format 1: <start> <end> <uni_start>
            # format 2: <start> <end> [ <uni1> <uni2> ... ]
            m = re.match(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', line)
            if m:
                start_hex = m.group(1).lower()
                end_hex = m.group(2).lower()
                uni_start_hex = m.group(3)
                start_val = int(start_hex, 16)
                end_val = int(end_hex, 16)
                uni_start_val = int(uni_start_hex, 16)
                code_len = len(start_hex)
                for code_val in range(start_val, end_val + 1):
                    code_hex = f"{code_val:0{code_len}x}"
                    uni_val = uni_start_val + (code_val - start_val)
                    try:
                        cmap[code_hex] = chr(uni_val)
                    except Exception:
                        pass
            else:
                # Check array format
                m_arr = re.match(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[(.*?)\]', line)
                if m_arr:
                    start_hex = m_arr.group(1).lower()
                    end_hex = m_arr.group(2).lower()
                    array_content = m_arr.group(3)
                    start_val = int(start_hex, 16)
                    end_val = int(end_hex, 16)
                    code_len = len(start_hex)
                    uni_hexes = re.findall(r'<([0-9a-fA-F]+)>', array_content)
                    for idx, code_val in enumerate(range(start_val, end_val + 1)):
                        if idx < len(uni_hexes):
                            code_hex = f"{code_val:0{code_len}x}"
                            uni_hex = uni_hexes[idx]
                            try:
                                uni_str = "".join(chr(int(uni_hex[j:j+4], 16)) for j in range(0, len(uni_hex), 4))
                                cmap[code_hex] = uni_str
                            except Exception:
                                pass
                                
    return cmap

def tokenize_content_stream(data):
    # This tokenizes the PDF content stream
    # It yields tuples (type, value)
    # Types: 'operator', 'name', 'number', 'string', 'hex_string', 'array'
    pos = 0
    length = len(data)
    
    # We want a basic scanner
    # PDF whitespace: \0, \t, \n, \f, \r, space
    # PDF delimiters: (, ), <, >, [, ], {, }, /, %
    whitespace = b'\x00\t\n\f\r '
    delimiters = b'()<>[]{}/%'
    
    while pos < length:
        # Skip whitespace
        while pos < length and data[pos:pos+1] in whitespace:
            pos += 1
        if pos >= length:
            break
            
        # Check comment
        if data[pos:pos+1] == b'%':
            while pos < length and data[pos:pos+1] not in b'\r\n':
                pos += 1
            continue
            
        char = data[pos:pos+1]
        
        # Name
        if char == b'/':
            start = pos
            pos += 1
            while pos < length and data[pos:pos+1] not in whitespace and data[pos:pos+1] not in delimiters:
                pos += 1
            yield ('name', data[start:pos].decode('latin-1'))
            continue
            
        # String
        if char == b'(':
            # Parse parenthesis string, handle nesting
            start = pos
            pos += 1
            depth = 1
            str_bytes = bytearray()
            while pos < length and depth > 0:
                c = data[pos:pos+1]
                if c == b'(':
                    depth += 1
                    str_bytes.extend(c)
                    pos += 1
                elif c == b')':
                    depth -= 1
                    if depth > 0:
                        str_bytes.extend(c)
                    pos += 1
                elif c == b'\\':
                    # Escape sequence
                    if pos + 1 < length:
                        next_c = data[pos+1:pos+2]
                        if next_c in b'()\\':
                            str_bytes.extend(next_c)
                            pos += 2
                        elif next_c in b'nrtbf':
                            # replace with control character
                            mapping = {b'n': b'\n', b'r': b'\r', b't': b'\t', b'b': b'\b', b'f': b'\f'}
                            str_bytes.extend(mapping[next_c])
                            pos += 2
                        elif next_c in b'01234567':
                            # octal escape: \ddd
                            octal_match = re.match(rb'^[0-7]{1,3}', data[pos+1:pos+4])
                            if octal_match:
                                octal_val = int(octal_match.group(0), 8)
                                str_bytes.append(octal_val)
                                pos += 1 + len(octal_match.group(0))
                            else:
                                pos += 2
                        else:
                            # just ignore the backslash
                            str_bytes.extend(next_c)
                            pos += 2
                    else:
                        pos += 1
                else:
                    str_bytes.extend(c)
                    pos += 1
            yield ('string', str_bytes)
            continue
            
        # Hex string or dictionary start <<
        if char == b'<':
            if pos + 1 < length and data[pos+1:pos+2] == b'<':
                pos += 2
                yield ('dict_start', '<<')
                continue
            else:
                # Parse hex string
                start = pos
                pos += 1
                while pos < length and data[pos:pos+1] != b'>':
                    pos += 1
                hex_content = data[start+1:pos]
                pos += 1 # skip '>'
                # remove whitespace from hex
                hex_content = re.sub(rb'\s+', b'', hex_content)
                yield ('hex_string', hex_content.decode('latin-1'))
                continue
                
        # Dictionary end >>
        if char == b'>':
            if pos + 1 < length and data[pos+1:pos+2] == b'>':
                pos += 2
                yield ('dict_end', '>>')
                continue
                
        # Array start [
        if char == b'[':
            pos += 1
            yield ('array_start', '[')
            continue
            
        # Array end ]
        if char == b']':
            pos += 1
            yield ('array_end', ']')
            continue
            
        # Number or Operator
        start = pos
        while pos < length and data[pos:pos+1] not in whitespace and data[pos:pos+1] not in delimiters:
            pos += 1
        val_str = data[start:pos].decode('latin-1')
        # Check if number
        if re.match(r'^[+-]?(\d+(\.\d*)?|\.\d+)$', val_str):
            yield ('number', float(val_str) if '.' in val_str else int(val_str))
        else:
            yield ('operator', val_str)

def extract_dict(data, start_pos):
    pos = start_pos + 2
    depth = 1
    length = len(data)
    while pos < length and depth > 0:
        if data[pos:pos+2] == b'<<':
            depth += 1
            pos += 2
        elif data[pos:pos+2] == b'>>':
            depth -= 1
            pos += 2
        else:
            pos += 1
    return data[start_pos:pos]

def get_page_fonts(pdf_objects, page_body):
    fonts = {}
    
    # 1. Find Resources
    res_match = re.search(rb'/Resources\s*(<<|(\d+)\s+\d+\s+R)', page_body)
    if not res_match:
        return fonts
        
    res_content = b''
    if res_match.group(1) == b'<<':
        res_content = extract_dict(page_body, res_match.start(1))
    else:
        res_obj_id = int(res_match.group(2))
        res_body = pdf_objects.get(res_obj_id, b'')
        dict_start = res_body.find(b'<<')
        if dict_start != -1:
            res_content = extract_dict(res_body, dict_start)
            
    # 2. Find Font dict inside Resources
    font_match = re.search(rb'/Font\s*(<<|(\d+)\s+\d+\s+R)', res_content)
    if not font_match:
        return fonts
        
    font_dict_content = b''
    if font_match.group(1) == b'<<':
        font_dict_content = extract_dict(res_content, font_match.start(1))
    else:
        font_obj_id = int(font_match.group(2))
        font_body = pdf_objects.get(font_obj_id, b'')
        dict_start = font_body.find(b'<<')
        if dict_start != -1:
            font_dict_content = extract_dict(font_body, dict_start)
            
    # 3. Parse font references
    font_refs = re.findall(rb'/(\w+)\s+(\d+)\s+\d+\s+R', font_dict_content)
    for font_name_bytes, font_obj_id_bytes in font_refs:
        font_name = font_name_bytes.decode('latin-1')
        font_obj_id = int(font_obj_id_bytes)
        
        font_body = pdf_objects.get(font_obj_id, b'')
        to_unicode_match = re.search(rb'/ToUnicode\s+(\d+)\s+\d+\s+R', font_body)
        if to_unicode_match:
            cmap_obj_id = int(to_unicode_match.group(1))
            cmap_body = pdf_objects.get(cmap_obj_id, b'')
            fonts[font_name] = parse_cmap(cmap_body)
        else:
            fonts[font_name] = {}
            
    return fonts

def extract_text_from_page(pdf_objects, page_idx, page_body):
    # Fetch page fonts and their CMaps
    fonts = get_page_fonts(pdf_objects, page_body)
    
    # Fetch contents
    contents_streams = []
    contents_match = re.search(rb'/Contents\s+(\d+)\s+\d+\s+R', page_body)
    if contents_match:
        contents_streams.append(int(contents_match.group(1)))
    else:
        # Check if contents is array of refs
        contents_array_match = re.search(rb'/Contents\s*\[(.*?)\]', page_body, re.DOTALL)
        if contents_array_match:
            refs = re.findall(rb'(\d+)\s+\d+\s+R', contents_array_match.group(1))
            for ref in refs:
                contents_streams.append(int(ref))
                
    full_text = []
    
    for c_id in contents_streams:
        c_body = pdf_objects.get(c_id)
        if not c_body:
            continue
        # Extract stream
        stream_match = re.search(rb'stream\r?\n(.*)\r?\nendstream', c_body, re.DOTALL)
        if not stream_match:
            stream_match = re.search(rb'stream\n(.*)\nendstream', c_body, re.DOTALL)
        if not stream_match:
            continue
            
        stream_data = stream_match.group(1)
        if b'/Filter/FlateDecode' in c_body or b'/Filter /FlateDecode' in c_body:
            try:
                stream_data = zlib.decompress(stream_data)
            except Exception:
                try:
                    stream_data = zlib.decompress(stream_data, -15)
                except Exception:
                    continue
                    
        # Tokenize and parse content stream
        tokens = list(tokenize_content_stream(stream_data))
        
        # State variables
        current_font = None
        current_font_cmap = {}
        
        # We want to iterate through tokens and reconstruct text
        i = 0
        num_tokens = len(tokens)
        
        while i < num_tokens:
            tok_type, tok_val = tokens[i]
            
            # Tf operator: set font and size
            # Format: /FontName Size Tf
            if tok_type == 'operator' and tok_val == 'Tf':
                # Check previous two tokens
                if i >= 2 and tokens[i-2][0] == 'name':
                    font_name = tokens[i-2][1].lstrip('/')
                    current_font = font_name
                    current_font_cmap = fonts.get(font_name, {})
            
            # Tj operator: show text
            # Format: string/hex Tj
            elif tok_type == 'operator' and tok_val == 'Tj':
                if i >= 1:
                    prev_type, prev_val = tokens[i-1]
                    text = decode_text_token(prev_type, prev_val, current_font_cmap)
                    full_text.append(text)
                    
            # TJ operator: show text with adjustments
            # Format: [ string/hex num string/hex ... ] TJ
            elif tok_type == 'operator' and tok_val == 'TJ':
                # Find the array token before TJ
                # The tokens before TJ should be a sequence: array_start ... array_end
                # Let's search backward to array_start
                j = i - 1
                array_tokens = []
                if j >= 0 and tokens[j][0] == 'array_end':
                    j -= 1
                    while j >= 0 and tokens[j][0] != 'array_start':
                        array_tokens.append(tokens[j])
                        j -= 1
                    array_tokens.reverse()
                    
                    # Process the tokens inside the array
                    page_segment = []
                    for t_type, t_val in array_tokens:
                        if t_type in ('string', 'hex_string'):
                            page_segment.append(decode_text_token(t_type, t_val, current_font_cmap))
                        elif t_type == 'number' and abs(t_val) > 150:
                            # If spacing is large, add space
                            page_segment.append(" ")
                    full_text.append("".join(page_segment))
                    
            # ' operator: next line and show text
            elif tok_type == 'operator' and tok_val == "'":
                if i >= 1:
                    prev_type, prev_val = tokens[i-1]
                    text = decode_text_token(prev_type, prev_val, current_font_cmap)
                    full_text.append("\n" + text)
                    
            # " operator: next line, spacing, show text
            elif tok_type == 'operator' and tok_val == '"':
                if i >= 1:
                    prev_type, prev_val = tokens[i-1]
                    text = decode_text_token(prev_type, prev_val, current_font_cmap)
                    full_text.append("\n" + text)
                    
            # Td/TD operator: translate matrix (new line if vertical translation is negative)
            elif tok_type == 'operator' and tok_val in ('Td', 'TD'):
                if i >= 1:
                    prev_type, prev_val = tokens[i-1]
                    if prev_type == 'number' and prev_val < -2:
                        full_text.append("\n")
                        
            # T* operator: start next line
            elif tok_type == 'operator' and tok_val == 'T*':
                full_text.append("\n")
                    
            i += 1
            
    return "".join(full_text)

def decode_text_token(t_type, t_val, cmap):
    if t_type == 'string':
        # Simple string: standard decoding using latin-1
        # If there are mapping tables, they would be applied. But usually simple strings are plain text.
        return t_val.decode('latin-1')
    elif t_type == 'hex_string':
        # Hex string: map using CMap
        # Split hex string into glyph codes (Identity-H uses 2 bytes = 4 hex digits per glyph)
        # Let's check how long each character is.
        # Identity-H / Identity-V standard is 2 bytes (4 hex characters).
        hex_len = len(t_val)
        result = []
        # If it's a multi-byte encoding (like Identity-H), it uses 4 hex digits.
        # Let's check if the cmap has keys of length 4.
        has_4_len_keys = any(len(k) == 4 for k in cmap.keys())
        chunk_size = 4 if has_4_len_keys else 2
        
        for j in range(0, hex_len, chunk_size):
            code = t_val[j:j+chunk_size].lower()
            if code in cmap:
                result.append(cmap[code])
            else:
                # fallback: convert code value to character
                try:
                    val = int(code, 16)
                    result.append(chr(val))
                except Exception:
                    result.append('?')
        return "".join(result)
    return ""

if __name__ == "__main__":
    pdf_path = "/Volumes/Photos/AI Studio/dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"
    pdf_objects = parse_pdf(pdf_path)
    
    # Find page objects
    page_objects = []
    for obj_id, body in pdf_objects.items():
        if b'/Type/Page' in body or b'/Type /Page' in body:
            if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
                page_objects.append((obj_id, body))
    page_objects.sort(key=lambda x: x[0])
    
    print(f"Parsed {len(page_objects)} pages.")
    
    # Extract text from page 4 (index 4)
    page_4_id, page_4_body = page_objects[4]
    print(f"\nReconstructed Text for PAGE 4 (Obj {page_4_id}):")
    p4_text = extract_text_from_page(pdf_objects, 4, page_4_body)
    print(p4_text)
