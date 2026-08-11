export function CategoryBar({
  selected,
  categories,
  onChange,
}: {
  selected: string
  categories: string[]
  onChange: (cat: string) => void
}) {
  return (
    <div className="deck-filter" style={{ marginBottom: '20px' }}>
      {categories.map((cat) => (
        <button
          key={cat}
          className={`filter-btn ${selected === cat ? 'active' : ''}`}
          onClick={() => onChange(cat)}
        >
          {cat === 'All' ? 'All questions' : `${cat} questions`}
        </button>
      ))}
    </div>
  )
}
