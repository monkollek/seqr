import { combineReducers } from 'redux'

import { loadingReducer, createSingleValueReducer, createSingleObjectReducer } from 'redux/utils/reducerFactories'
import { RECEIVE_DATA, REQUEST_SAVED_VARIANTS } from 'redux/utils/reducerUtils'
import { SHOW_ALL, SORT_BY_XPOS } from 'shared/utils/constants'
import { HttpRequestHelper } from 'shared/utils/httpRequestHelper'

// action creators and reducers in one file as suggested by https://github.com/erikras/ducks-modular-redux
const REQUEST_SUCCESS_STORY = 'REQUEST_SUCCESS_STORY'
const RECEIVE_SUCCESS_STORY = 'RECEIVE_SUCCESS_STORY'
const REQUEST_MME = 'REQUEST_MME'
const RECEIVE_MME = 'RECEIVE_MME'
const REQUEST_SAMPLE_METADATA = 'REQUEST_SAMPLE_METADATA'
const RECEIVE_SAMPLE_METADATA = 'RECEIVE_SAMPLE_METADATA'
const RECEIVE_SAVED_VARIANT_TAGS = 'RECEIVE_SAVED_VARIANT_TAGS'
const UPDATE_ALL_PROJECT_SAVED_VARIANT_TABLE_STATE = 'UPDATE_ALL_PROJECT_VARIANT_STATE'
const RECEIVE_EXTERNAL_ANALYSIS_UPLOAD_STATS = 'RECEIVE_EXTERNAL_ANALYSIS_UPLOAD_STATS'

// Data actions

export const loadMme = () => (dispatch) => {
  dispatch({ type: REQUEST_MME })
  new HttpRequestHelper('/api/summary_data/matchmaker',
    (responseJson) => {
      dispatch({ type: RECEIVE_DATA, updatesById: responseJson })
      dispatch({ type: RECEIVE_MME, newValue: responseJson })
    },
    (e) => {
      dispatch({ type: RECEIVE_MME, error: e.message, newValue: [] })
    }).get()
}

const loadDataRows = (requestAction, receiveAction, urlPath) => (loadId, filterValues) => (dispatch) => {
  if (loadId) {
    dispatch({ type: requestAction })
    new HttpRequestHelper(`/api/summary_data/${urlPath}/${loadId}`,
      (responseJson) => {
        dispatch({ type: receiveAction, newValue: responseJson.rows })
      },
      (e) => {
        dispatch({ type: receiveAction, error: e.message, newValue: [] })
      }).get(filterValues)
  }
}

export const loadSuccessStory = loadDataRows(REQUEST_SUCCESS_STORY, RECEIVE_SUCCESS_STORY, 'success_story')
export const loadSampleMetadata = loadDataRows(REQUEST_SAMPLE_METADATA, RECEIVE_SAMPLE_METADATA, 'sample_metadata')

export const loadSavedVariants = ({ tag, gene = '' }) => (dispatch, getState) => {
  // Do not load if already loaded
  if (tag && tag !== SHOW_ALL) {
    const loadedTags = getState().savedVariantTags
    if (loadedTags[tag] || tag.split(';').some(t => loadedTags[t])) {
      return
    }
  } else if (!gene) {
    return
  }

  dispatch({ type: REQUEST_SAVED_VARIANTS })
  new HttpRequestHelper(`/api/summary_data/saved_variants/${tag}`,
    (responseJson) => {
      if (tag && !gene) {
        dispatch({
          type: RECEIVE_SAVED_VARIANT_TAGS,
          updates: { [tag]: true },
        })
      }
      dispatch({ type: RECEIVE_DATA, updatesById: responseJson })
    },
    (e) => {
      dispatch({ type: RECEIVE_DATA, error: e.message, updatesById: {} })
    }).get({ gene })
}

export const updateAllProjectSavedVariantTable = updates => (
  { type: UPDATE_ALL_PROJECT_SAVED_VARIANT_TABLE_STATE, updates })

export const updateExternalAnalysis = values => dispatch => new HttpRequestHelper(
  '/api/summary_data/update_analysed_by',
  (responseJson) => {
    dispatch({ type: RECEIVE_EXTERNAL_ANALYSIS_UPLOAD_STATS, newValue: responseJson })
  },
).post(values)

export const reducers = {
  successStoryLoading: loadingReducer(REQUEST_SUCCESS_STORY, RECEIVE_SUCCESS_STORY),
  successStoryRows: createSingleValueReducer(RECEIVE_SUCCESS_STORY, []),
  mmeLoading: loadingReducer(REQUEST_MME, RECEIVE_MME),
  mmeMetrics: createSingleValueReducer(RECEIVE_MME, {}, 'metrics'),
  mmeSubmissions: createSingleValueReducer(RECEIVE_MME, [], 'submissions'),
  sampleMetadataLoading: loadingReducer(REQUEST_SAMPLE_METADATA, RECEIVE_SAMPLE_METADATA),
  sampleMetadataRows: createSingleValueReducer(RECEIVE_SAMPLE_METADATA, []),
  savedVariantTags: createSingleObjectReducer(RECEIVE_SAVED_VARIANT_TAGS),
  externalAnalysisUploadStats: createSingleValueReducer(RECEIVE_EXTERNAL_ANALYSIS_UPLOAD_STATS, {}),
  allProjectSavedVariantTableState: createSingleObjectReducer(UPDATE_ALL_PROJECT_SAVED_VARIANT_TABLE_STATE, {
    sort: SORT_BY_XPOS,
    page: 1,
    recordsPerPage: 25,
  }, false),
}

const rootReducer = combineReducers(reducers)

export default rootReducer
