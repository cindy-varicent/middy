import createError from 'http-errors'
import _ajv from 'ajv/dist/2019.js'
import localize from 'ajv-i18n'
import formats from 'ajv-formats'
// import formatsDraft2019 from 'ajv-formats-draft2019'  // if requested
import errors from 'ajv-errors'

const Ajv = _ajv.default // esm workaround linting

let ajv
const defaults = {
  strict: true,
  coerceTypes: 'array', // important for query string params
  allErrors: true,
  useDefaults: 'empty',
  messages: false, // allow i18n
  defaultLanguage: 'en'
}

export default ({ inputSchema, outputSchema, ajvOptions, ajvInstance = null }) => {
  const options = Object.assign({}, defaults, ajvOptions)
  ajv = ajvInstance || new Ajv(options)
  formats(ajv)
  // formatsDraft2019(ajv)
  if (options.allErrors) errors(ajv)

  // TODO refactor, not pretty enough - invalid schema can throw errors outside of middy, this resolves that
  let validateInput = null
  let validateOutput = null
  if (inputSchema) {
    try {
      validateInput = ajv.compile(inputSchema)
    } catch (e) {}
  }
  if (outputSchema) {
    try {
      validateOutput = ajv.compile(outputSchema)
    } catch (e) {}
  }

  const validateMiddlewareBefore = async (handler) => {
    if (!validateInput) throw new Error('Input Schema Error')
    const valid = validateInput(handler.event)

    if (!valid) {
      const error = new createError.BadRequest('Event object failed validation')
      handler.event.headers = Object.assign({}, handler.event.headers)

      const language = chooseLanguage(handler.event, options.defaultLanguage)
      localize[language](validateInput.errors)

      error.details = validateInput.errors
      throw error
    }
  }

  const validateMiddlewareAfter = async (handler) => {
    if (!validateOutput) throw new Error('Output Schema Error')
    const valid = validateOutput(handler.response)

    if (!valid) {
      const error = new createError.InternalServerError('Response object failed validation')
      error.details = validateOutput.errors
      error.response = handler.response
      throw error
    }
  }
  return {
    before: inputSchema ? validateMiddlewareBefore : null,
    after: outputSchema ? validateMiddlewareAfter : null
  }
}

/* in ajv-i18n Portuguese is represented as pt-BR */
const languageNormalizationMap = {
  pt: 'pt-BR',
  'pt-br': 'pt-BR',
  pt_BR: 'pt-BR',
  pt_br: 'pt-BR',
  zh: 'zh-TW',
  'zh-tw': 'zh-TW',
  zh_TW: 'zh-TW',
  zh_tw: 'zh-TW'
}

const normalizePreferredLanguage = (lang) => languageNormalizationMap[lang] || lang

const availableLanguages = Object.keys(localize)
const chooseLanguage = ({ preferredLanguage }, defaultLanguage) => {
  if (preferredLanguage) {
    const lang = normalizePreferredLanguage(preferredLanguage)
    if (availableLanguages.includes(lang)) {
      return lang
    }
  }

  return defaultLanguage
}
