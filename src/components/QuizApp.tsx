'use client'

import { useState, useMemo, useCallback } from 'react'
import type { Question } from '@/lib/quiz'
import { CATEGORIES } from '@/lib/quiz'
import { CategoryBar } from './CategoryBar'
import { QuizCard } from './QuizCard'
import { Sidebar } from './Sidebar'

export function QuizApp({ questions }: { questions: Question[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  const filtered = useMemo(() => {
    if (selectedCategory === 'All') return questions
    return questions.filter((q) => q.category === selectedCategory)
  }, [questions, selectedCategory])

  const current = filtered[currentIndex] ?? null

  const handleAnswer = useCallback(
    (choiceIndex: number) => {
      if (answered || !current) return
      setSelectedChoice(choiceIndex)
      setAnswered(true)
      setStats((s) => ({
        answered: s.answered + 1,
        correct: s.correct + (choiceIndex === current.answer ? 1 : 0),
      }))
    },
    [answered, current]
  )

  const goNext = useCallback(() => {
    if (currentIndex < filtered.length - 1) {
      setCurrentIndex((i) => i + 1)
      setAnswered(false)
      setSelectedChoice(null)
    }
  }, [currentIndex, filtered.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
      setAnswered(false)
      setSelectedChoice(null)
    }
  }, [currentIndex])

  const handleCategoryChange = useCallback((cat: string) => {
    setSelectedCategory(cat)
    setCurrentIndex(0)
    setAnswered(false)
    setSelectedChoice(null)
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Recall Loop</h1>
          <p>Multiple-choice practice with instant feedback.</p>
        </div>
        <div className="toolbar">
          <a href="/auth/logout" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Logout
          </a>
        </div>
      </header>

      <CategoryBar
        selected={selectedCategory}
        categories={['All', ...CATEGORIES]}
        onChange={handleCategoryChange}
      />

      <div className="layout">
        <QuizCard
          question={current}
          index={currentIndex}
          total={filtered.length}
          answered={answered}
          selectedChoice={selectedChoice}
          onAnswer={handleAnswer}
          onNext={goNext}
          onPrev={goPrev}
        />
        <Sidebar answered={stats.answered} correct={stats.correct} />
      </div>
    </main>
  )
}
