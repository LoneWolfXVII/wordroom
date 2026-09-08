import json, re
from wordfreq import zipf_frequency
from better_profanity import profanity
profanity.load_censor_words()

words = set(w.strip() for w in open("enable1.txt") if re.fullmatch(r"[a-z]+", w.strip()))
# extra unpleasant / sensitive terms not in the profanity list (answers only)
unpleasant = set("""
nazis nazi rapes raped rapist slave slaves slaver negro negros gypsy gypsies
lynch lynched abort abuse abused incest whore whores bimbo pussy penis vulva
dildo enema urine feces faeces vomit puked corpse cancer tumor tumour leper
lepers heroin cocaine nigga bitch bitchy slutty sluts fagot fags fagots homos
molest killer killed murder murders deaths dying suicide bigot bigots harlot
tranny spooks spook coons coon kikes kike chinks chink wetback retard retards
""".split())
# UK/rare variants that annoy non-UK players (answers only)
manual = set("tesla celeb fecal obese ulcer horst cotta aggie banco trier ahold quaker caesar pullman munster kelvin lyndon hitler stalin lenin islam jewry aryan".split())
variants = set("colour flavour honour labour armour tumour favour humour vigour odour".split())

import os
nd="/usr/local/lib/python3.12/dist-packages/names/"
namefreq={}
for f in ["dist.all.last","dist.female.first","dist.male.first"]:
    for line in open(nd+f):
        p=line.split()
        if len(p)>=2: namefreq[p[0].lower()]=max(namefreq.get(p[0].lower(),0), float(p[1]))
def is_name(w):
    # common US surname/first name and not a frequent common word
    return namefreq.get(w,0) >= 0.003 and zipf_frequency(w,"en") < 4.3

def inflected(w):
    # doubled-consonant inflections: nodding->nod, crammed->cram, hopped->hop
    for suf in ("ing","ed"):
        if w.endswith(suf):
            stem=w[:-len(suf)]
            if len(stem)>=3 and stem[-1]==stem[-2] and stem[:-1] in words: return True
    # plural / 3rd person
    if w.endswith("s") and not w.endswith("ss") and w[:-1] in words: return True
    if w.endswith("es") and w[:-2] in words: return True
    if w.endswith("ies") and w[:-3]+"y" in words: return True
    # past tense
    if w.endswith("ed") and (w[:-2] in words or w[:-1] in words): return True
    if w.endswith("ied") and w[:-3]+"y" in words: return True
    # gerund
    if w.endswith("ing") and (w[:-3] in words or w[:-3]+"e" in words): return True
    # comparative / superlative
    if w.endswith("er") and (w[:-2] in words or w[:-1] in words) and zipf_frequency(w[:-2],"en")>zipf_frequency(w,"en"): return True
    if w.endswith("est") and (w[:-3] in words or w[:-2] in words): return True
    return False

def bad(w):
    return profanity.contains_profanity(w) or w in unpleasant or w in variants or w in manual or is_name(w)

out = {}
targets = {5: 2000, 6: 1600, 7: 1600}
for L, target in targets.items():
    guesses = sorted(w for w in words if len(w) == L)
    scored = sorted(((zipf_frequency(w, "en"), w) for w in guesses), reverse=True)
    answers = []
    for z, w in scored:
        if z < (2.95 if L==5 else 3.0): break
        if inflected(w) or bad(w): continue
        answers.append(w)
        if len(answers) >= target: break
    out[L] = {"answers": answers, "guesses": guesses, "min_zipf": round(z, 2)}
    print(L, "guesses", len(guesses), "answers", len(answers), "cutoff zipf", round(z,2))
    print("  hardest 15:", answers[-15:])
    print("  sample mid:", answers[len(answers)//2:len(answers)//2+10])

json.dump({str(k): {"answers": v["answers"], "guesses": v["guesses"]} for k, v in out.items()}, open("wordlists.json", "w"))
for L in targets:
    open(f"answers-{L}.txt", "w").write("\n".join(out[L]["answers"]))
    open(f"guesses-{L}.txt", "w").write("\n".join(out[L]["guesses"]))
