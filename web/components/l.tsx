// Bilingual interface label: English normally, Urdu in Urdu mode (English in "both" mode).
export function L({ en, ur, className = "" }: { en: string; ur: string; className?: string }) {
  return (
    <>
      <span className={`ui-en ${className}`}>{en}</span>
      <span className={`ui-ur ur ur-tight !leading-normal ${className}`}>{ur}</span>
    </>
  );
}
