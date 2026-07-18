with open("chapter2_german_clean.txt", "r", encoding="utf-8") as f:
    text = f.read()

parts = text.split("\n\n")
last_part = parts[-1]

# Let's print out the text starting from index 8000 in chunks of 800 chars
# so we can easily read and locate the paragraphs
pos = 8000
while pos < len(last_part):
    chunk = last_part[pos:pos+800]
    print(f"=== POS {pos} ===")
    print(chunk)
    print("-" * 50)
    pos += 800
