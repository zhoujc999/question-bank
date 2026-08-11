export function Sidebar({
  answered,
  correct,
  total,
}: {
  answered: number
  correct: number
  total: number
}) {
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0

  return (
    <aside className="panel sidebar">
      <h2 className="section-title">Session</h2>
      <div className="stats-grid">
        <div className="stat">
          <strong>{answered}</strong>
          <span>Answered</span>
        </div>
        <div className="stat">
          <strong>{accuracy}%</strong>
          <span>Accuracy</span>
        </div>
      </div>
    </aside>
  )
}
