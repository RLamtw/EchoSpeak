with open("chapter2_raw.txt", "r", encoding="utf-8") as f:
    raw_content = f.read()

pages = raw_content.split("============================================================\n")
print(f"Total raw pages found: {len(pages)}")

with open("chapter2_clean_draft.txt", "r", encoding="utf-8") as f:
    clean_content = f.read()
clean_lines = clean_content.split('\n')
print(f"Total clean lines: {len(clean_lines)}")

# Print lengths of first 5 pages in clean draft
for idx, page in enumerate(pages[:5]):
    print(f"Raw Page {idx} length: {len(page)} chars")
    snippet = page[:120].strip().replace('\n', ' ')
    print(f"  Snippet: {snippet}")
