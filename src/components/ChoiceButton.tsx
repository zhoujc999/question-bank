const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function ChoiceButton({
  index,
  text,
  state,
  onClick,
}: {
  index: number
  text: string
  state: 'idle' | 'selected' | 'correct' | 'wrong'
  onClick: () => void
}) {
  const classMap: Record<typeof state, string> = {
    idle: 'choice',
    selected: 'choice selected',
    correct: 'choice correct',
    wrong: 'choice wrong',
  }

  return (
    <button
      className={classMap[state]}
      onClick={onClick}
      disabled={state !== 'idle' && state !== 'selected'}
    >
      <span className="choice-letter">{LETTERS[index] || '?'}</span>
      <span className="choice-text">{text}</span>
    </button>
  )
}
