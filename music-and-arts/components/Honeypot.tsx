export function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label htmlFor="website">Website</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  )
}
