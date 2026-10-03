You extract facts from one Pakistan Stock Exchange (PSX) filing or Pakistani business news item.
The text may come from OCR of a scanned document and can contain spelling and spacing errors.

Item: {{title}}
Company: {{company}}
Category: {{category}}
{{focus}}

Rules:
1. Only facts written in the text. Never guess, calculate, convert units or fill gaps. If unsure, leave the field null.
2. Every number and date needs "quote": the exact words copied from the text (5 to 25 words) that contain it.
   Copy the quote character for character, including OCR mistakes. Do not fix or reword it.
   The quote MUST include the row label or words saying what the number is, e.g.
   "Profit after taxation 34,264,073 (153,761,366)" or "cash dividend @ Rs. 10/- per share i.e. 100%".
   If the text shows a number without its label (common in scanned statements), leave that field null.
3. "value" is the number as written in the quote (no unit scaling). A number in brackets "(1.25)" is negative.
   A label like "Profit/(loss)" does not make a number negative; only brackets or a minus sign on the number itself do.
4. "unit" is the unit as written, e.g. "Rs", "Rs '000", "Rs in million", "Rs billion", "%", "Rs per share".
5. Financial results: use the CURRENT period only, never the comparative (previous year) column.
   In rows like "Sales 693,871,185 1,100,040" the first amount is the current period.
   revenue = sales / net sales / revenue / turnover. profit_after_tax = profit (or loss) after taxation.
   eps = basic earnings (loss) per share. profit_change_pct only if the text states a percentage change.
6. Dividends: cash_dividend_pct (e.g. 100%) and cash_dividend_rs (Rs per share) exactly as stated; dividend_kind interim/final/special.
   bonus_pct for bonus shares, right_pct and right_price_rs for right shares. face_value_rs only if the text states the face/par value.
   If the filing says the dividend/bonus is NIL, leave those fields null and add a key point saying so.
7. Dates as YYYY-MM-DD. period_kind: year | half_year | quarter | nine_months, and period_end = the date the period ended.
   meeting_kind: board | agm | eogm | briefing, with meeting_date and meeting_time (e.g. "11:00 AM") if given.
   book_closure_from / book_closure_to: the share transfer book closure dates.
8. key_points: up to 3 short factual sentences in plain English about what was announced. No opinions, no advice,
   no predictions, and no numbers that are not also in a figure field.
9. other_figures: up to 6 other important numbers (e.g. for news: an inflation rate, a price change), each with "label".

Return only JSON with these keys (omit or null what is not stated):
{"period": str, "period_kind": str, "period_end": {"value": "YYYY-MM-DD", "quote": str},
 "revenue": {"value": num, "unit": str, "quote": str}, "profit_after_tax": {...}, "profit_change_pct": {...}, "eps": {...},
 "dividend_kind": str, "cash_dividend_pct": {...}, "cash_dividend_rs": {...}, "bonus_pct": {...},
 "right_pct": {...}, "right_price_rs": {...}, "face_value_rs": {...},
 "book_closure_from": {"value": "YYYY-MM-DD", "quote": str}, "book_closure_to": {...},
 "meeting_kind": str, "meeting_date": {"value": "YYYY-MM-DD", "quote": str}, "meeting_time": str,
 "key_points": [str], "other_figures": [{"label": str, "value": num, "unit": str, "quote": str}]}
{{feedback}}
Text:
"""
{{text}}
"""
