/** Static content for Debate mode: style presets, topics. */

export type PresetId = 'lawyer' | 'philosopher' | 'comedian' | 'scientist' | 'politician' | 'street' | 'custom'

export const STYLE_PRESETS: Array<{ id: PresetId; label: string; text: string }> = [
  {
    id: 'lawyer',
    label: 'Lawyer',
    text: 'Argue like a ruthless trial lawyer. Build a tight case, expose every contradiction in your opponent’s argument, and close each turn with a line the jury will remember.',
  },
  {
    id: 'philosopher',
    label: 'Philosopher',
    text: 'Speak like a calm philosopher. Question hidden assumptions, define your terms carefully, and use thought experiments. Never raise your voice.',
  },
  {
    id: 'comedian',
    label: 'Comedian',
    text: 'Be funny and sarcastic. Use wit, irony and vivid analogies to make your opponent’s points look absurd, while still making a real argument.',
  },
  {
    id: 'scientist',
    label: 'Scientist',
    text: 'Argue like a careful scientist. Lean on data, studies and statistics, quantify where you can, separate correlation from causation, and admit uncertainty honestly.',
  },
  {
    id: 'politician',
    label: 'Politician',
    text: 'Speak like a seasoned politician. Be persuasive and confident, connect the issue to ordinary people’s lives, and pivot attacks back to your core message.',
  },
  {
    id: 'street',
    label: 'Street-smart',
    text: 'Be street-smart and blunt. Use plain words, real-world common sense and everyday examples. No jargon, no fluff — call nonsense what it is.',
  },
  { id: 'custom', label: 'Custom', text: '' },
]

export const EXAMPLE_TOPICS = [
  'Remote work is better than working in an office.',
  'Social media does more harm than good.',
  'Pineapple belongs on pizza.',
  'Artificial intelligence should be regulated like nuclear power.',
  'Cities should ban private cars from their centres.',
]

export const RANDOM_TOPICS = [
  ...EXAMPLE_TOPICS,
  'Homework should be abolished.',
  'Space exploration is worth the cost.',
  'A four-day work week should be the standard.',
  'Cats make better companions than dogs.',
  'Voting should be compulsory.',
  'Universities should be free for everyone.',
  'It is ethical to eat meat.',
  'Video games are a legitimate art form.',
  'Tipping culture should be abolished.',
  'Humanity should try to colonise Mars.',
  'Billionaires should not exist.',
  'Zoos do more good than harm.',
  'Breakfast is the most important meal of the day.',
  'Self-driving cars should replace human drivers.',
  'Printed books are better than e-books.',
  'Daylight saving time should be scrapped.',
  'Superheroes are bad role models.',
  'Nuclear power is the best answer to climate change.',
  'Is a hot dog a sandwich?',
  'Should children be allowed to use smartphones before age 14?',
]

export function randomTopic(current: string) {
  const pool = RANDOM_TOPICS.filter((t) => t !== current)
  return pool[Math.floor(Math.random() * pool.length)]
}
