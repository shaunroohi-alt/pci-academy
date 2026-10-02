export function Contact({ name, email, phone, extra }: { name: string; email: string; phone: string; extra?: string }) {
  return (
    <div className="text-sm">
      <p className="font-medium">{name}</p>
      <p><a href={`mailto:${email}`} className="text-gold-deep hover:underline">{email}</a></p>
      <p><a href={`tel:${phone}`} className="hover:underline">{phone}</a></p>
      {extra && <p className="text-muted">{extra}</p>}
    </div>
  )
}
