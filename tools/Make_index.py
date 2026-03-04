import json
import os
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS_DIR = os.path.join(BASE_DIR, "pokemon-tcg-data-master", "cards", "en")
OUT_FILE = os.path.join(BASE_DIR, "data", "cards-index.json")

cards = []

for file in glob.glob(os.path.join(CARDS_DIR, "*.json")):
    with open(file, "r", encoding="utf-8") as f:
        data = json.load(f)

        for card in data:
            img = None

            if "images" in card:
                images = card["images"]
                img = images.get("large") or images.get("small")

            cards.append({
                "id": card.get("id"),
                "name": card.get("name"),
                "img": img
            })

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(cards, f, ensure_ascii=False)

print("Cartas encontradas:", len(cards))
print("Index criado em:", OUT_FILE)