with open("chapter2_german_clean.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Para 18 is the last part
parts = text.split("\n\n")
last_part = parts[-1]
print(f"Last part length: {len(last_part)} characters.")

# Let's search for typical paragraph-starting sentences or phrases in German
# and print their locations
search_phrases = [
    "Die Frage des Jünglings nach dem ewigen Leben",
    "Jesus weist auf den allein guten Gott",
    "Es folgt ein zweiter Fluchtversuch",
    "Die offenbaren Gebote",
    "Jesus zielt nicht",
    "Zweimal ist der Jüngling",
    "Dreierlei ist in diesen",
    "Das dritte ist dies",
    "Der Jüngling ist nun",
    "Hier wird die Situation",
    "Die Jünger sind entsetzt",
    "Das ist der Unterschied",
    "Wer von uns will",
    "Wer will",
    "Jesus antwortet",
    "Petrus fängt an",
    "Und Jesus antwortete"
]

for phrase in search_phrases:
    pos = last_part.find(phrase)
    if pos != -1:
        print(f"Found: '{phrase}' at pos {pos}")
        # Print snippet
        print(f"  Snippet: {last_part[pos:pos+150]}")
    else:
        # Search case insensitive or substring
        pos_lower = last_part.lower().find(phrase.lower())
        if pos_lower != -1:
            print(f"Found (CI): '{phrase}' at pos {pos_lower}")
            print(f"  Snippet: {last_part[pos_lower:pos_lower+150]}")
        else:
            print(f"NOT found: '{phrase}'")
