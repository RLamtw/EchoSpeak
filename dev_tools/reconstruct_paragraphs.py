import re

def main():
    with open("chapter2_clean_draft.txt", "r", encoding="utf-8") as f:
        text = f.read()
        
    # Let's clean up the interleaved footnote block on Page 48:
    # "Dem tritt der Ruf Jesu mächtig entgegen, gerade Person. Er ist darum... [footnotes] 33 Dtr Ruf in die Nachfolge 49 jetzt unter"
    # We want to replace this entire footnote insertion with "gerade jetzt"
    interleaved_fn_pattern = r'gerade\s+Person\.\s+Er\s+ist\s+darum\s+der\s+Mittler\s+zwischen\s+Gott\s+und\s+mir\s+und\s+mein\s+Heiland\.\s+1\.\s+Tim\s+2,5\."\s+Vgl\.\s+1933\s+DBW\s+12,\s+294f\.\s+D\s+7\s+Vgl\.\s+hierzu\s+auch\s+1926\s+DBW\s+9,\s+513-532\s+und\s+1934\s+DBW\s+13,\s+344-346\s+sowie\s+7\.\s+4\.\s+1934\s+DBW\s+13,\s+120f\.\s+D\s+8\s+Vier\s*-\s*tes\s+Gebot,\s+Ex\s+20,12:\s+"Du\s+sollst\s+deinen\s+Vater\s+und\s+deine\s+Mutter\s+ehren"\.\s+33\s+Dtr\s+Ruf\s+in\s+die\s+Nachfolge\s+49\s+jetzt'
    text = re.sub(interleaved_fn_pattern, 'gerade jetzt', text)
    
    # Let's also check for other interleaved footnote marks or footnote numbers like '7', '8', '9', '10', '11' in the text
    # e.g., "(Mk. 2,14). 1" -> "(Mk. 2,14)."
    # "Christentum2." -> "Christentum."
    # "Wortes.3" -> "Wortes."
    # "geworfen.4" -> "geworfen."
    # "Mythos.5" -> "Mythos."
    # "Gottmensch6" -> "Gottmensch"
    # "97-62).7" -> "97-62)."
    # "bindet ihn.8" -> "bindet ihn."
    # "unwiderstehlich.9" -> "unwiderstehlich."
    # "gehört. 10" -> "gehört."
    # "Programm 11" -> "Programm"
    # "Situation.12" -> "Situation."
    # "herzugehen.13" -> "herzugehen."
    # "Wasser14" -> "Wasser"
    # "herzustellen 15" -> "herzustellen"
    # "glaubt. 16" -> "glaubt."
    # "guten Baum 17" -> "guten Baum"
    # "führen. 18" -> "führen."
    # "iustitia civilis19" -> "iustitia civilis"
    # "Mißverständnisses20" -> "Mißverständnisses"
    # "äußeren Tuns.21" -> "äußeren Tuns."
    # "se ist22" -> "se ist"
    # "Komm her. "23" -> "Komm her. \""
    # "Bruder24" -> "Bruder"
    # "Römer 1,17),25" -> "Römer 1,17),"
    # "Seelsorge.26" -> "Seelsorge."
    # "Meer27" -> "Meer"
    # "19,16-22).28" -> "19,16-22)."
    # "Welche" ?29" -> "Welche\"?"
    # "Konflikts"30" -> "Konflikts\""
    # "gesagt haben?"31" -> "gesagt haben?\""
    # "Gottes sein32" -> "Gottes sein"
    # "Gebote33" -> "Gebote"
    
    # We can use regex to remove trailing footnote numbers on word boundaries or after punctuation:
    text = re.sub(r'(\w+)\d+\b', r'\1', text) # remove numbers appended to words like Christentum2 -> Christentum
    text = re.sub(r'(\.)\s*\d+\b', r'\1', text) # remove numbers after periods like Wortes.3 -> Wortes.
    text = re.sub(r'(\?)\s*\d+\b', r'\1', text)
    text = re.sub(r'(\")\s*\d+\b', r'\1', text)
    text = re.sub(r'(\))\s*\d+\b', r'\1', text)
    text = re.sub(r'(\b\w+)\s+\d+\b', r'\1', text) # remove space + number e.g. "se ist 22" or "Programm 11"
    
    # Fix spacing issues
    # Decoded text sometimes has double spaces or "J esus" instead of "Jesus"
    text = text.replace("J esus", "Jesus")
    text = text.replace("j esus", "jesus")
    text = text.replace("J ún-I ger", "Jünger")
    text = text.replace("J ünger", "Jünger")
    text = text.replace("Giaube", "Glaube")
    text = text.replace("Giauben", "Glauben")
    
    # Let's write a parser to split into clean paragraphs.
    # In Bonhoeffer works, a new paragraph usually starts on a new line and begins with a capital letter,
    # or starts with a quote, and the previous line ends with a period.
    # Let's inspect the clean text. If we join everything into one long text and then split at paragraph starts:
    # Let's look at the German paragraph list:
    # 1. "Und da Jesus vorüberging, sah er Levi..."
    # 2. "Was wird über den Inhalt der Nachfolge gesagt?..." (Starts at "Was wird über...")
    # 3. "Nachfolge ist Bindung an Christus..."
    # 4. "Nachfolge ohne Jesus Christus ist Eigenwahl..."
    # 5. "Der erste Jünger trägt Jesus die Nachfolge selbst an..."
    # 6. "Wo aber Jesus selbst ruft..."
    # 7. "Der dritte versteht die Nachfolge..."
    # 8. "Nachfolgen heißt bestimmte Schritte tun..."
    # 9. "Mit dem ersten Schritt..."
    # 10. "Um der Uneigentlichkeit..."
    # 11. "Nur der Gehorsame glaubt..."
    # 12. "Der erste Schritt des Gehorsams..."
    # 13. "Ist diese Erkenntnis gesichert..."
    # 14. "Und doch muß das äußere Werk..."
    # 15. "Der Ungehorsame kann nicht glauben..."
    # 16. "Wer hier allzuschnell..."
    # 17. "Es ist für den Seelsorger..."
    # 18. "Hier hat sich der Ungehorsame..."
    # 19. "Damit stehen wir bereits..."
    
    # Let's split using these known paragraph starters as anchors to split text:
    anchors = [
        r'"Und da Jesus vorüberging',
        r'Was wird über den Inhalt',
        r'Nachfolge ist Bindung an Christus',
        r'Nachfolge ohne\s+Jesus Christus ist',
        r'Der erste Jünger trägt',
        r'Wo aber Jesus selbst ruft',
        r'Der dritte versteht die Nachfolge',
        r'Nachfolgen heißt bestimmte Schritte',
        r'Mit dem ersten Schritt',
        r'Um der Uneigentlichkeit',
        r'Nur der Gehorsame glaubt',
        r'Der erste Schritt des Gehorsams',
        r'Ist diese Erkenntnis gesichert',
        r'Und doch muß das äußere Werk',
        r'Der Ungehorsame kann nicht glauben',
        r'Wer hier allzuschnell',
        r'Es ist für den Seelsorger',
        r'Hier hat sich der Ungehorsame',
        r'Damit stehen wir bereits',
        r'Die Frage des Jünglings nach dem ewigen Leben',
        r'Jesus weist auf den allein guten Gott',
        r'Es folgt ein zweiter Fluchtversuch',
        r'Die offenbaren Gebote Gottes',
        r'Jesus zielt nicht auf das Problem',
        r'Zweimal ist der Jüngling nun unter',
        r'Dreierlei ist in diesen Worten',
        r'Diese erforderte Situation wird geschaffen',
        r'Und das dritte: Jesus nimmt',
        r'Der Jüngling ist eben bisher nicht vollkommen',
        r'Der Ruf in die Nachfolge bekommt auch hier',
        r'Diese Geschichte vom reichen Jüngling',
        r'Die Frage des Schriftgelehrten ist dieselbe',
        r'Unzählige Male ist seither dem',
        r'Die ganze Geschichte vom barmherzigen Samariter',
        r'Gibt es eine Antwort darauf',
        r'Die Frage: was soll ich tun\?, war der erste Betrug',
        r'Die Antwort ist: Du selbst bist der Nächste',
        r'Nächster zu sein, ist nicht eine Qualifikation',
        r'Fragst du abermals erschreckt',
        r'Was Gehorsam ist, lerne ich',
        r'Aus dem Zwiespalt des Gewissens'
    ]
    
    # Join text into single line (replace newlines with spaces)
    single_line = re.sub(r'\s*\n\s*', ' ', text).strip()
    
    # Split by anchors
    paragraphs = []
    current_pos = 0
    
    # Find positions of all anchors
    anchor_positions = []
    for anchor in anchors:
        m = re.search(anchor, single_line)
        if m:
            anchor_positions.append((m.start(), anchor))
            
    anchor_positions.sort()
    
    for idx, (pos, anchor) in enumerate(anchor_positions):
        if idx > 0:
            prev_pos = anchor_positions[idx - 1][0]
            paragraphs.append(single_line[prev_pos:pos].strip())
            
    # Add the last part
    if anchor_positions:
        last_pos = anchor_positions[-1][0]
        paragraphs.append(single_line[last_pos:].strip())
        
    print(f"Reconstructed {len(paragraphs)} paragraphs.")
    for i, p in enumerate(paragraphs):
        print(f"\n[Para {i+1}] length: {len(p)} chars")
        print(p[:150] + "...")
        
    with open("chapter2_german_clean.txt", "w", encoding="utf-8") as outf:
        outf.write("\n\n".join(paragraphs))

if __name__ == "__main__":
    main()
