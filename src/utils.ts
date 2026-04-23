import { distance } from "fastest-levenshtein"

const TOKEN_SIMILARITY_THRESHOLD = 0.8
const TITLE_MATCH_THRESHOLD = 0.78

type TokenMatch = {
  queryToken: string
  titleToken: string | null
  titleIndex: number
  score: number
  weight: number
}

const normalizeString = (input: string) => {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export const getQueryContext = (request: {
  url: string
  loadedUrl?: string
  userData: Record<string, unknown>
}) => {
  const query =
    typeof request.userData.searchTerm === "string" ? request.userData.searchTerm : request.url
  const normalizedQuery = normalizeString(query)
  const queryUrl = request.loadedUrl ?? request.url

  return {
    query,
    normalizedQuery,
    queryUrl,
  }
}

const tokenize = (input: string) => {
  return normalizeString(input)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
}

const similarityScore = (a: string, b: string) => {
  const aNormalized = normalizeString(a)
  const bNormalized = normalizeString(b)
  const maxLength = Math.max(aNormalized.length, bNormalized.length)

  if (maxLength === 0) {
    return 1
  }

  return 1 - distance(aNormalized, bNormalized) / maxLength
}

const tokenWeight = (token: string) => {
  if (/\d/.test(token) && /[a-z]/i.test(token)) {
    return 2.5
  }

  if (token.length >= 8) {
    return 2.2
  }

  if (token.length >= 5) {
    return 1.6
  }

  if (token.length >= 3) {
    return 1
  }

  return 0.4
}

export const evaluateTitleMatch = (title: string, searchTerm: string) => {
  const queryTokens = tokenize(searchTerm)
  const titleTokens = tokenize(title)

  if (queryTokens.length === 0 || titleTokens.length === 0) {
    return {
      accepted: false,
      score: 0,
      reason: "empty_tokens",
      matches: [] as TokenMatch[],
    }
  }

  const matches: TokenMatch[] = queryTokens.map((queryToken) => {
    let bestScore = 0
    let bestIndex = -1
    let bestToken: string | null = null

    for (let index = 0; index < titleTokens.length; index += 1) {
      const titleToken = titleTokens[index]
      const score = similarityScore(queryToken, titleToken)

      if (score > bestScore) {
        bestScore = score
        bestIndex = index
        bestToken = titleToken
      }
    }

    const matched = bestScore >= TOKEN_SIMILARITY_THRESHOLD

    return {
      queryToken,
      titleToken: matched ? bestToken : null,
      titleIndex: matched ? bestIndex : -1,
      score: bestScore,
      weight: tokenWeight(queryToken),
    }
  })

  const totalWeight = matches.reduce((sum, match) => sum + match.weight, 0)
  const matchedWeight = matches.reduce((sum, match) => {
    if (match.titleToken === null) {
      return sum
    }

    return sum + match.weight * match.score
  }, 0)

  const coverageScore = totalWeight === 0 ? 0 : matchedWeight / totalWeight

  const matchedIndices = []
  for (const match of matches) {
    if (match.titleIndex >= 0) {
      matchedIndices.push(match.titleIndex)
    }
  }

  let isInOrder = true
  for (let index = 1; index < matchedIndices.length; index += 1) {
    if (matchedIndices[index - 1] > matchedIndices[index]) {
      isInOrder = false
      break
    }
  }

  const orderScore = isInOrder ? 1 : 0.6

  let compactnessScore = 1
  if (matchedIndices.length > 1) {
    let minIndex = matchedIndices[0]
    let maxIndex = matchedIndices[0]

    for (let index = 1; index < matchedIndices.length; index += 1) {
      const matchedIndex = matchedIndices[index]

      if (matchedIndex < minIndex) {
        minIndex = matchedIndex
      }

      if (matchedIndex > maxIndex) {
        maxIndex = matchedIndex
      }
    }

    const span = maxIndex - minIndex + 1
    compactnessScore = matchedIndices.length / span
  }

  const finalScore = coverageScore * 0.7 + orderScore * 0.15 + compactnessScore * 0.15
  const importantMissing = matches.some((match) => match.weight >= 1.6 && match.titleToken === null)

  return {
    accepted: !importantMissing && finalScore >= TITLE_MATCH_THRESHOLD,
    score: finalScore,
    reason: importantMissing
      ? "missing_important_token"
      : finalScore < TITLE_MATCH_THRESHOLD
        ? "low_score"
        : "ok",
    matches,
  }
}
