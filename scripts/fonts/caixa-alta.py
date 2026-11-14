"""Caixa alta pela fonte, não pelo CSS (WEB-135).

`text-transform: uppercase` muda o texto que o Safari e o Chrome entregam ao
leitor de tela ("botão ACESSAR MINHA CONTA"). Este script acrescenta às fontes
do site o conjunto estilístico `ss20`, que troca cada minúscula pelo desenho da
maiúscula. O CSS liga com `font-feature-settings: "ss20"`: a tela fica igual e
o texto do DOM (leitor de tela, copiar, buscar, traduzir) fica o do código.

A troca é o primeiro lookup do GSUB, antes de `liga` e `ccmp`, como seria com o
texto já em maiúsculas. Rodar de novo numa fonte já tratada não faz nada.

    python3 -m pip install fonttools brotli
    python3 scripts/fonts/caixa-alta.py apps/web/public/fonts/onside/*.woff2 \
      apps/web/public/fonts/houdini/*.woff2

Depois suba o `?v=` das URLs das fontes, senão o cache serve a antiga.
"""

import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot

TAG = 'ss20'
RULES = (
    ('SubRuleSet', 'SubRule'),
    ('SubClassSet', 'SubClassRule'),
    ('ChainSubRuleSet', 'ChainSubRule'),
    ('ChainSubClassSet', 'ChainSubClassRule'),
)


def caps_map(font):
    cmap = font.getBestCmap()
    mapping = {}
    for cp, glyph in cmap.items():
        upper = chr(cp).upper()
        if len(upper) != 1 or upper == chr(cp):
            continue
        target = cmap.get(ord(upper))
        if target and target != glyph:
            mapping[glyph] = target
    return mapping


def shift_lookup_refs(gsub):
    for record in gsub.FeatureList.FeatureRecord:
        record.Feature.LookupListIndex = [i + 1 for i in record.Feature.LookupListIndex]
    if getattr(gsub, 'FeatureVariations', None):
        for var in gsub.FeatureVariations.FeatureVariationRecord:
            for sub in var.FeatureTableSubstitution.SubstitutionRecord:
                sub.Feature.LookupListIndex = [i + 1 for i in sub.Feature.LookupListIndex]
    for lookup in gsub.LookupList.Lookup:
        for table in lookup.SubTable:
            if lookup.LookupType == 7:
                table = table.ExtSubTable
            for name in ('SubstLookupRecord', 'SubstLookupRecords'):
                for record in getattr(table, name, None) or []:
                    record.LookupListIndex += 1
            for set_attr, rule_attr in RULES:
                for rule_set in getattr(table, set_attr, None) or []:
                    if rule_set is None:
                        continue
                    for rule in getattr(rule_set, rule_attr, None) or []:
                        for record in rule.SubstLookupRecord:
                            record.LookupListIndex += 1


def add_caps(path):
    font = TTFont(path)
    gsub = font['GSUB'].table
    if any(r.FeatureTag == TAG for r in gsub.FeatureList.FeatureRecord):
        print(f'{path}: já tem {TAG}')
        return

    sub = ot.SingleSubst()
    sub.mapping = caps_map(font)
    lookup = ot.Lookup()
    lookup.LookupType = 1
    lookup.LookupFlag = 0
    lookup.SubTable = [sub]
    lookup.SubTableCount = 1

    shift_lookup_refs(gsub)
    gsub.LookupList.Lookup.insert(0, lookup)
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)

    feature = ot.Feature()
    feature.FeatureParams = None
    feature.LookupListIndex = [0]
    feature.LookupCount = 1
    record = ot.FeatureRecord()
    record.FeatureTag = TAG
    record.Feature = feature
    records = gsub.FeatureList.FeatureRecord
    records.append(record)
    records.sort(key=lambda r: r.FeatureTag)
    index = records.index(record)
    gsub.FeatureList.FeatureCount = len(records)

    def remap(indices):
        return sorted((i + 1 if i >= index else i) for i in indices) + [index]

    if getattr(gsub, 'FeatureVariations', None):
        for var in gsub.FeatureVariations.FeatureVariationRecord:
            for s in var.FeatureTableSubstitution.SubstitutionRecord:
                if s.FeatureIndex >= index:
                    s.FeatureIndex += 1
    for script in gsub.ScriptList.ScriptRecord:
        langs = [script.Script.DefaultLangSys] + [
            r.LangSys for r in script.Script.LangSysRecord
        ]
        for lang in langs:
            if lang is None:
                continue
            lang.FeatureIndex = sorted(remap(lang.FeatureIndex))
            lang.FeatureCount = len(lang.FeatureIndex)
            if lang.ReqFeatureIndex != 0xFFFF and lang.ReqFeatureIndex >= index:
                lang.ReqFeatureIndex += 1

    font.save(path)
    print(f'{path}: {TAG} com {len(sub.mapping)} letras')


for arg in sys.argv[1:]:
    add_caps(arg)
