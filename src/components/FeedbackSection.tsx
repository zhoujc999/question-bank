export function FeedbackSection({
  selectedChoice,
  correctAnswer,
  choices,
  explanation,
}: {
  selectedChoice: number
  correctAnswer: number
  choices: string[]
  explanation: string
}) {
  const isCorrect = selectedChoice === correctAnswer

  return (
    <div className={`feedback show ${isCorrect ? 'good' : 'bad'}`}>
      <h3>{isCorrect ? 'Correct!' : 'Not quite'}</h3>
      <p>
        You selected <strong>{choices[selectedChoice]}</strong>.
        {!isCorrect && (
          <>
            {' '}
            The correct answer is <strong>{choices[correctAnswer]}</strong>.
          </>
        )}
      </p>
      {explanation && (
        <div className="explanation">
          <strong>Explanation</strong>
          <p>{explanation}</p>
        </div>
      )}
    </div>
  )
}
