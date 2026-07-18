import sys

try:
    with open('智能朗讀器/raw_data/translation_progress.json', 'rb') as f:
        data = f.read()
    
    print("File size in bytes:", len(data))
    
    # Try to decode and find where it fails
    try:
        data.decode('utf-8')
        print("Success! File is valid UTF-8.")
    except UnicodeDecodeError as e:
        print("Decode failed:", e)
        start = max(0, e.start - 50)
        end = min(len(data), e.end + 50)
        chunk = data[start:end]
        print(f"Bytes around failure (from {start} to {end}):")
        print(chunk)
        print("Decoding with 'replace':")
        print(chunk.decode('utf-8', errors='replace'))
except Exception as ex:
    print("Error:", ex)
