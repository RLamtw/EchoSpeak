import re
import zlib
from pdf_text_extractor import parse_pdf, tokenize_content_stream, decode_text_token

def test_extract_with_newlines(pdf_objects, page_idx, page_body):
    # Find contents
    contents_match = re.search(rb'/Contents\s+(\d+)\s+\d+\s+R', page_body)
    contents_streams = []
    if contents_match:
        contents_streams.append(int(contents_match.group(1)))
    else:
        contents_array_match = re.search(rb'/Contents\s*\[(.*?)\]', page_body)
        if contents_array_match:
            refs = re.findall(rb'(\d+)\s+\d+\s+R', contents_array_match.group(1))
            for ref in refs:
                contents_streams.append(int(ref))
                
    # Get fonts
    resources_match = re.search(rb'/Resources\s+(\d+)\s+\d+\s+R', page_body)
    fonts = {}
    if resources_match:
        # We can extract fonts from Resources object, but pdf_text_extractor has its own cache.
        # Let's import the font cmaps from pdf_text_extractor
        pass
        
    # We can just run a custom loop over the page contents stream
    from pdf_text_extractor import get_page_fonts
    fonts = get_page_fonts(pdf_objects, page_body)
    
    full_text = []
    
    for c_id in contents_streams:
        c_body = pdf_objects.get(c_id)
        if not c_body:
            continue
        stream_match = re.search(rb'stream\r?\n(.*)\r?\nendstream', c_body, re.DOTALL)
        if not stream_match:
            stream_match = re.search(rb'stream\n(.*)\nendstream', c_body, re.DOTALL)
        if not stream_match:
            continue
        stream_data = stream_match.group(1)
        if b'/Filter/FlateDecode' in c_body or b'/Filter /FlateDecode' in c_body:
            stream_data = zlib.decompress(stream_data)
            
        tokens = list(tokenize_content_stream(stream_data))
        current_font = None
        current_font_cmap = {}
        i = 0
        num_tokens = len(tokens)
        
        while i < num_tokens:
            tok_type, tok_val = tokens[i]
            
            # Font change
            if tok_type == 'operator' and tok_val == 'Tf':
                if i >= 2 and tokens[i-2][0] == 'name':
                    font_name = tokens[i-2][1].lstrip('/')
                    current_font_cmap = fonts.get(font_name, {})
            
            # Tj / TJ
            elif tok_type == 'operator' and tok_val == 'Tj':
                if i >= 1:
                    prev_type, prev_val = tokens[i-1]
                    text = decode_text_token(prev_type, prev_val, current_font_cmap)
                    full_text.append(text)
            elif tok_type == 'operator' and tok_val == 'TJ':
                j = i - 1
                array_tokens = []
                if j >= 0 and tokens[j][0] == 'array_end':
                    j -= 1
                    while j >= 0 and tokens[j][0] != 'array_start':
                        array_tokens.append(tokens[j])
                        j -= 1
                    array_tokens.reverse()
                    page_segment = []
                    for t_type, t_val in array_tokens:
                        if t_type in ('string', 'hex_string'):
                            page_segment.append(decode_text_token(t_type, t_val, current_font_cmap))
                        elif t_type == 'number' and abs(t_val) > 150:
                            page_segment.append(" ")
                    full_text.append("".join(page_segment))
            
            # Newlines on positioning
            elif tok_type == 'operator' and tok_val in ('Td', 'TD'):
                if i >= 1:
                    prev_type, prev_val = tokens[i-1] # y offset
                    if prev_type == 'number' and prev_val < -2:
                        full_text.append("\n")
            elif tok_type == 'operator' and tok_val == 'T*':
                full_text.append("\n")
                
            i += 1
            
    return "".join(full_text)

def main():
    pdf_path = "dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"
    pdf_objects = parse_pdf(pdf_path)
    page_objects = []
    for obj_id, body in pdf_objects.items():
        if b'/Type/Page' in body or b'/Type /Page' in body:
            if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
                page_objects.append((obj_id, body))
    page_objects.sort(key=lambda x: x[0])
    
    # Test on Page 44 (Chapter 2 Page 1)
    obj_id, body = page_objects[44]
    text = test_extract_with_newlines(pdf_objects, 44, body)
    text = text.replace("sie", "ie")
    print(f"Total lines extracted: {len(text.splitlines())}")
    print("\n--- FIRST 15 LINES ---")
    for i, line in enumerate(text.splitlines()[:15]):
        print(f"Line {i:2d}: {line}")

if __name__ == "__main__":
    main()
