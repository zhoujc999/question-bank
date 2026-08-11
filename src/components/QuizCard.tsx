import type { Question } from '@/lib/quiz'
import { ChoiceButton } from './ChoiceButton'
import { FeedbackSection } from './FeedbackSection'

export function QuizCard({
  question,
  index,
  total,
  answered,
  selectedChoice,
  onAnswer,
  onNext,
  onPrev,
}: {
  question: Question | null
  index: number
  total: number
  answered: boolean
  selectedChoice: number | null
  onAnswer: (i: number) => void
  onNext: () => void
  onPrev: () => void
}) {
  if (!question) {
    return (
      <section className="panel quiz-card">
        <div className="empty-state">
          <h2>No questions in this category</h2>
          <p>Select a different category or add questions via the Supabase dashboard.</p>
        </div>
      </section>
    )
  }

  function getChoiceState(choiceIndex: number): 'idle' | 'selected' | 'correct' | 'wrong' {
    if (!answered) {
      return selectedChoice === choiceIndex ? 'selected' : 'idle'
    }
    if (choiceIndex === question!.answer) return 'correct'
    if (choiceIndex === selectedChoice) return 'wrong'
    return 'idle'
  }

  return (
    <section className="panel quiz-card">
      <div className="eyebrow">
        <span>{question.category}</span>
        <span>
          {index + 1} of {total}
        </span>
      </div>

      <h2 className="question">{question.question}</h2>

      <div className="choices">
        {question.choices.map((choice, i) => (
          <ChoiceButton
            key={i}
            index={i}
            text={choice}
            state={getChoiceState(i)}
            onClick={() => onAnswer(i)}
          />
        ))}
      </div>

      {answered && selectedChoice !== null && (
        <FeedbackSection
          selectedChoice={selectedChoice}
          correctAnswer={question.answer}
          choices={question.choices}
          explanation={question.explanation}
        />
      )}

      <div className="actions">
        <button className="btn btn-secondary" onClick={onPrev} disabled={index === 0}>
          Previous
        </button>
        <button className="btn btn-primary" onClick={onNext} disabled={index >= total - 1}>
          Next
        </button>
      </div>
    </section>
  )
}
