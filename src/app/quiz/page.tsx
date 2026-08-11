import { createClient } from '@/lib/supabase/server'
import { QuizApp } from '@/components/QuizApp'
import type { Question } from '@/lib/quiz'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const supabase = await createClient()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .returns<Question[]>()

  if (!questions || questions.length === 0) {
    return (
      <div className="app-shell">
        <div className="panel empty-state">
          <h2>No questions yet</h2>
          <p>Add questions via the Supabase dashboard to get started.</p>
        </div>
      </div>
    )
  }

  return <QuizApp questions={questions} />
}
