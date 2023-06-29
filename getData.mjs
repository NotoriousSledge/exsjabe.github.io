// @ts-check
import {readFile} from 'fs/promises'
import path from 'path'
import {fileURLToPath} from 'url'
import {z} from 'zod'

const estimates = z.object({
  lowerEstimate: z.number(),
  higherEstimate: z.number(),
  complexity: z.number(),
  confidence: z.number(),
})

const gantt = z.object({
  position: z.number(),
  start: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
})

const minorTask = z
  .object({
    name: z.string(),
  })
  .and(estimates)
  .and(
    z.object({
      comment: z.string().optional(),
    })
  )

const majorTaskIn = z.object({
  name: z.string(),
  tasks: z.array(minorTask),
  gantt: gantt,
})

const majorTask = z.preprocess((val) => {
  const input = majorTaskIn.parse(val)
  const totals = input.tasks.reduce(
    (acc, task) => {
      acc.lowerEstimate += task.lowerEstimate
      acc.higherEstimate += task.higherEstimate
      acc.complexity += task.complexity / input.tasks.length
      acc.confidence += task.confidence / input.tasks.length

      return acc
    },
    {lowerEstimate: 0, higherEstimate: 0, complexity: 0, confidence: 0}
  )

  totals.complexity = Math.round(totals.complexity)
  totals.confidence = Math.round(totals.confidence)

  return {
    ...input,
    ...totals,
  }
}, majorTaskIn.and(estimates))

const taskCategoryIn = z.object({
  name: z.string(),
  tasks: z.array(majorTask),
})

const taskCategory = z.preprocess((val) => {
  const input = taskCategoryIn.parse(val)
  const totals = input.tasks.reduce(
    (acc, task) => {
      acc.lowerEstimate += task.lowerEstimate
      acc.higherEstimate += task.higherEstimate
      acc.complexity += task.complexity / input.tasks.length
      acc.confidence += task.confidence / input.tasks.length

      return acc
    },
    {lowerEstimate: 0, higherEstimate: 0, complexity: 0, confidence: 0}
  )
  totals.complexity = Math.round(totals.complexity)
  totals.confidence = Math.round(totals.confidence)
  input.tasks.sort((a, b) => {
    return a.gantt.position - b.gantt.position
  })

  return {
    ...input,
    ...totals,
  }
}, taskCategoryIn.and(estimates))

const estimateSchema = z.object({
  estimates: z.array(taskCategory),
})

const estimateList = z.preprocess((val) => {
  const input = estimateSchema.parse(val)
  const totals = input.estimates.reduce(
    (acc, task) => {
      acc.lowerEstimate += task.lowerEstimate
      acc.higherEstimate += task.higherEstimate
      acc.complexity += task.complexity / input.estimates.length
      acc.confidence += task.confidence / input.estimates.length

      return acc
    },
    {lowerEstimate: 0, higherEstimate: 0, complexity: 0, confidence: 0}
  )
  totals.complexity = Math.round(totals.complexity)
  totals.confidence = Math.round(totals.confidence)

  return {
    ...input,
    ...totals,
  }
}, estimateSchema.and(estimates))

const fileDir = path.dirname(fileURLToPath(import.meta.url))
/**
 * @typedef {z.infer<typeof minorTask>} MinorTask
 * @typedef {z.infer<typeof majorTask>} MajorTask
 * @typedef {z.infer<typeof taskCategory>} TaskCategory
 * @typedef {z.infer<typeof estimateSchema>} Input
 * */
const est = await readFile(path.join(fileDir, 'estimates.json'), 'utf8')
  .then(JSON.parse)
  .then(estimateList.parse)

console.log(
  `Premilinärt projiceras projektets lägre gräns till \`${est.lowerEstimate}\` effektiva arbetstimmar och övre gräns till \`${est.higherEstimate}\`,
  med en genomsnittlig komplexitet på \`${est.complexity}/5\` och en genomsnittlig korrekthet av estimat på \`${est.confidence}/5\`.
  `
)

const title =
  'Rubrik | Lägst | Högst | Komplexitet | Korrekthet |  Kommentar\n---|---|---|---|---|---'

est.estimates.forEach((category) => {
  console.log(`## ${category.name}`)
  console.log(title)
  category.tasks.forEach((task) => {
    console.log(
      formatTask(task, ['tasks', 'gantt'], (v) => `<b>${v}</b>`, [''])
    )

    task.tasks.forEach((subTask) => {
      console.log(formatTask(subTask, []))
    })
  })

  console.log(
    `<b>Total</b> | ${formatTask(
      category,
      ['tasks', 'name'],
      (v) => `<b>${v}</b>`,
      ['']
    )}`
  )
})

/** @param {MinorTask | MajorTask | TaskCategory} task - The tasks to format
 * @param {string[]} exclude - The keys to exclude from the output
 * @param {((v: string) => string) | undefined} format - A function to format the output
 * @param {string[] | undefined} concat - Elements to concat to the resulting array
 * */
function formatTask(task, exclude, format = undefined, concat = []) {
  /** @type {(v: string) => string} */
  const formatCb = format ? format : (v) => v
  return Object.entries(task)
    .map(([key, value]) => {
      if (exclude.includes(key)) return undefined
      return formatCb(value)
    })
    .filter((v) => typeof v !== 'undefined')
    .concat(concat.map(formatCb))
    .join(' | ')
}

console.log(generateGantt(est.estimates))

/** @param {TaskCategory[]} lst */
function generateGantt(lst) {
  return `\`\`\`mermaid
  gantt
        dateFormat  YYYY-MM-DD
        axisFormat v. %W
        title Gantt Diagram över WebForage tidsprojektion

        ${lst.map(buildGanttSection).join('\n')}
\`\`\``
}

/** @param {TaskCategory} section */
function buildGanttSection(section) {
  let str = `section ${section.name}\n`
  for (const task of section.tasks) {
    str += `${task.name} : `
    if (task.gantt.color) str += `${task.gantt.color}, `
    if (task.gantt.label) str += `${task.gantt.label}, `
    str += `${task.gantt.start}, ${task.higherEstimate}h\n`
  }

  return str
}
