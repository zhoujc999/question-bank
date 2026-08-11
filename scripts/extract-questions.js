const fs = require('fs')
const path = require('path')

function main() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'reference.html'), 'utf-8')

  const startMarker = '/* QUESTION_BANK_START */'
  const endMarker = '/* QUESTION_BANK_END */'
  const start = html.indexOf(startMarker)
  const end = html.indexOf(endMarker)

  if (start === -1 || end === -1 || end <= start) {
    console.error('Could not find question data markers in reference.html')
    process.exit(1)
  }

  const block = html.slice(start + startMarker.length, end)
  const match = block.match(/const sampleQuestions = (\[[\s\S]*?\]);/)
  if (!match) {
    console.error('Could not parse sampleQuestions array')
    process.exit(1)
  }

  let questions
  try {
    questions = JSON.parse(match[1])
    console.log(`Found ${questions.length} questions in reference.html`)
  } catch (err) {
    console.error('Failed to parse JSON:', err.message)
    process.exit(1)
  }

  const sqlStatements = questions.map((q) => {
    const category = q.group || 'General'
    const safeQuestion = q.question.replace(/'/g, "''")
    const safeChoices = JSON.stringify(q.choices)
    const safeExplanation = (q.explanation || '').replace(/'/g, "''")
    const answer = q.answer

    return `INSERT INTO questions (category, question, choices, answer, explanation)
VALUES (
  '${category}',
  '${safeQuestion}',
  '${safeChoices}'::jsonb,
  ${answer},
  '${safeExplanation}'
);`
  })

  const sql = `-- Auto-generated from reference.html\n-- ${questions.length} questions\n\n${sqlStatements.join('\n\n')}`

  const outputPath = path.join(__dirname, '..', 'supabase', 'seed.sql')
  fs.writeFileSync(outputPath, sql)
  console.log(`Wrote ${questions.length} INSERT statements to supabase/seed.sql`)

  // Count by category
  const byCategory = {}
  questions.forEach((q) => {
    const cat = q.group || 'General'
    byCategory[cat] = (byCategory[cat] || 0) + 1
  })
  console.log('\nQuestions by category:')
  Object.entries(byCategory).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`)
  })
}

main()
