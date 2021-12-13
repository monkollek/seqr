import { createSelector } from 'reselect'

import {
  FAMILY_ANALYSIS_STATUS_OPTIONS,
  FAMILY_FIELD_ID,
  INDIVIDUAL_FIELD_ID,
  FAMILY_FIELD_FIRST_SAMPLE,
  FAMILY_NOTES_FIELDS,
  SHOW_ALL,
  GENOME_VERSION_DISPLAY_LOOKUP,
  getVariantMainTranscript,
  INDIVIDUAL_EXPORT_DATA,
  INDIVIDUAL_HAS_DATA_FIELD,
} from 'shared/utils/constants'
import { toCamelcase, toSnakecase, snakecaseToTitlecase } from 'shared/utils/stringUtils'

import {
  getProjectsByGuid, getFamiliesGroupedByProjectGuid, getIndividualsByGuid, getSamplesByGuid, getGenesById, getUser,
  getAnalysisGroupsGroupedByProjectGuid, getSavedVariantsByGuid, getSortedIndividualsByFamily,
  getMmeResultsByGuid, getMmeSubmissionsByGuid, getHasActiveSearchableSampleByFamily, getTagTypesByProject,
  getVariantTagsByGuid, getUserOptionsByUsername, getSamplesByFamily, getNotesByFamilyType,
  getSamplesGroupedByProjectGuid, getVariantTagNotesByFamilyVariants,
} from 'redux/selectors'

import {
  SORT_BY_FAMILY_NAME,
  CASE_REVIEW_STATUS_OPTIONS,
  FAMILY_FILTER_LOOKUP,
  FAMILY_SORT_OPTIONS,
  FAMILY_EXPORT_DATA,
  CASE_REVIEW_FAMILY_EXPORT_DATA,
  CASE_REVIEW_TABLE_NAME,
  CASE_REVIEW_INDIVIDUAL_EXPORT_DATA,
  SAMPLE_EXPORT_DATA,
} from './constants'

const FAMILY_SORT_LOOKUP = FAMILY_SORT_OPTIONS.reduce(
  (acc, opt) => ({
    ...acc,
    [opt.value]: opt.createSortKeyGetter,
  }), {},
)

// project data selectors

export const getProjectGuid = state => state.currentProjectGuid
export const getProjectDetailsIsLoading = state => state.projectDetailsLoading.isLoading
export const getProjectOverviewIsLoading = state => state.projectOverviewLoading.isLoading
export const getMatchmakerMatchesLoading = state => state.matchmakerMatchesLoading.isLoading
export const getMatchmakerContactNotes = state => state.mmeContactNotes
export const getRnaSeqDataLoading = state => state.rnaSeqDataLoading.isLoading
export const getFamilyTagTypeCounts = state => state.familyTagTypeCounts
export const getFamiliesLoading = state => state.familiesLoading.isLoading
export const getFamilyDetailsLoading = state => state.familyDetailsLoading.isLoading
export const getFamilyVariantSummaryLoading = state => state.familyVariantSummaryLoading.isLoading
export const getMmeSubmissionsLoading = state => state.mmeSubmissionsLoading.isLoading
export const getSamplesLoading = state => state.samplesLoading.isLoading
export const getTagTypesLoading = state => state.tagTypesLoading.isLoading

export const getCurrentProject = createSelector(
  getProjectsByGuid, getProjectGuid, (projectsByGuid, currentProjectGuid) => projectsByGuid[currentProjectGuid],
)

const selectEntitiesForProjectGuid =
  (entitiesGroupedByProjectGuid, projectGuid) => entitiesGroupedByProjectGuid[projectGuid] || {}
export const getProjectFamiliesByGuid = createSelector(
  getFamiliesGroupedByProjectGuid, getProjectGuid, selectEntitiesForProjectGuid,
)
export const getProjectAnalysisGroupsByGuid = createSelector(
  getAnalysisGroupsGroupedByProjectGuid, getProjectGuid, selectEntitiesForProjectGuid,
)
const getProjectSamplesByGuid = createSelector(
  getSamplesGroupedByProjectGuid, getProjectGuid, selectEntitiesForProjectGuid,
)

const getAnalysisGroupGuid = (state, props) => (
  (props || {}).match ? props.match.params.analysisGroupGuid : (props || {}).analysisGroupGuid
)

const getCurrentAnalysisGroup = createSelector(
  getProjectAnalysisGroupsByGuid,
  getAnalysisGroupGuid,
  (projectAnalysisGroupsByGuid, analysisGroupGuid) => analysisGroupGuid &&
    projectAnalysisGroupsByGuid[analysisGroupGuid],
)

export const getProjectAnalysisGroupFamiliesByGuid = createSelector(
  getProjectFamiliesByGuid,
  getCurrentAnalysisGroup,
  (projectFamiliesByGuid, analysisGroup) => {
    if (!analysisGroup) {
      return projectFamiliesByGuid
    }
    return analysisGroup.familyGuids.reduce(
      (acc, familyGuid) => ({ ...acc, [familyGuid]: projectFamiliesByGuid[familyGuid] }), {},
    )
  },
)

export const getProjectAnalysisGroupIndividualsCount = createSelector(
  getProjectAnalysisGroupFamiliesByGuid,
  familiesByGuid => Object.values(familiesByGuid).reduce((acc, family) => acc + family.individualGuids.length, 0),
)

export const getProjectAnalysisGroupIndividualsByGuid = createSelector(
  getIndividualsByGuid,
  getProjectAnalysisGroupFamiliesByGuid,
  (individualsByGuid, familiesByGuid) => Object.values(familiesByGuid).reduce((acc, family) => ({
    ...acc,
    ...family.individualGuids.reduce((indivAcc, individualGuid) => (
      { ...indivAcc, [individualGuid]: { ...individualsByGuid[individualGuid], [FAMILY_FIELD_ID]: family.familyId } }
    ), {}),
  }), {}),
)

export const getProjectAnalysisGroupSamplesByTypes = createSelector(
  getProjectSamplesByGuid,
  getSamplesByFamily,
  getCurrentAnalysisGroup,
  (projectSamplesByGuid, samplesByFamily, analysisGroup) => (analysisGroup ? analysisGroup.familyGuids.reduce(
    (acc, familyGuid) => ([...acc, ...(samplesByFamily[familyGuid] || [])]), [],
  ) : Object.values(projectSamplesByGuid)).reduce((acc, sample) => {
    const loadedDate = (sample.loadedDate).split('T')[0]
    const typeKey = `${sample.sampleType}__${sample.datasetType}`
    if (!acc[typeKey]) {
      acc[typeKey] = {}
    }
    acc[typeKey][loadedDate] = (acc[typeKey][loadedDate] || 0) + 1
    return acc
  }, {}),
)

export const getProjectAnalysisGroupMmeSubmissionDetails = createSelector(
  getMmeSubmissionsByGuid,
  getProjectAnalysisGroupFamiliesByGuid,
  getGenesById,
  getNotesByFamilyType,
  (submissionsByGuid, familiesByGuid, genesById, notesByFamilyType) => {
    const individualFamilies = Object.values(familiesByGuid).reduce((acc, family) => ({
      ...acc,
      ...family.individualGuids.reduce((acc2, individualGuid) => ({ ...acc2, [individualGuid]: family }), {}),
    }), {})

    return Object.values(submissionsByGuid).reduce((acc, submission) => {
      const family = individualFamilies[submission.individualGuid]
      return family ? [...acc, {
        mmeNotes: (notesByFamilyType[family.familyGuid] || {}).M,
        familyName: family.displayName,
        familyGuid: family.familyGuid,
        projectGuid: family.projectGuid,
        geneSymbols: (submission.geneIds || []).map(geneId => (genesById[geneId] || {}).geneSymbol || geneId),
        ...submission,
      }] : acc
    }, [])
  },
)

export const getTagTypeData = createSelector(
  getProjectGuid,
  getTagTypesByProject,
  getCurrentAnalysisGroup,
  getFamilyTagTypeCounts,
  (projectGuid, tagTypesByProject, analysisGroup, familyTagTypeCounts) => {
    let tagTypeCounts
    if (analysisGroup) {
      tagTypeCounts = analysisGroup.familyGuids.reduce((acc, familyGuid) => Object.entries(
        familyTagTypeCounts[familyGuid] || {},
      ).reduce((acc2, [tagTypeGuid, { count }]) => (
        { ...acc2, [tagTypeGuid]: count + (acc2[tagTypeGuid] || 0) }
      ), acc), {})
    }

    return (tagTypesByProject[projectGuid] || []).map(vtt => ({
      count: tagTypeCounts ? tagTypeCounts[vtt.variantTagTypeGuid] || 0 : vtt.numTags,
      ...vtt,
    }))
  },
)

export const getTagTypeDataByFamily = createSelector(
  getProjectGuid,
  getTagTypesByProject,
  getFamilyTagTypeCounts,
  (projectGuid, tagTypesByProject, familyTagTypeCounts) => {
    const tagTypesByGuid = (tagTypesByProject[projectGuid] || []).reduce(
      (acc, vtt) => ({ ...acc, [vtt.variantTagTypeGuid]: vtt }), {},
    )
    return Object.entries(familyTagTypeCounts).reduce((acc, [familyGuid, tagTypeCounts]) => ({
      ...acc,
      [familyGuid]: Object.entries(tagTypeCounts).map(
        ([tagTypeGuid, count]) => ({ ...tagTypesByGuid[tagTypeGuid], ...count }),
      ).sort((a, b) => a.order - b.order),
    }), {})
  },
)

export const getTaggedVariantsByFamily = createSelector(
  getSavedVariantsByGuid,
  getGenesById,
  getVariantTagsByGuid,
  (savedVariants, genesById, variantTagsByGuid) => Object.values(savedVariants).filter(
    variant => variant.tagGuids.length,
  ).reduce((acc, variant) => {
    const { familyGuids, ...variantDetail } = variant
    variantDetail.tags = variant.tagGuids.map(tagGuid => variantTagsByGuid[tagGuid])
    variantDetail.genes = Object.keys(variant.transcripts || {}).map(geneId => genesById[geneId])
    familyGuids.forEach((familyGuid) => {
      if (!acc[familyGuid]) {
        acc[familyGuid] = []
      }
      acc[familyGuid].push(variantDetail)
    })
    return acc
  }, {}),
)

export const getTaggedVariantsByFamilyType = createSelector(
  getTaggedVariantsByFamily,
  variantsByFamily => Object.entries(variantsByFamily).reduce((acc, [familyGuid, variants]) => ({
    ...acc,
    [familyGuid]: variants.reduce((acc2, variant) => {
      const isSv = !!variant.svType
      const accSvVals = acc2[isSv] || []
      accSvVals.push(variant)
      return { ...acc2, [isSv]: accSvVals }
    }, {}),
  }), {}),
)

export const getVariantUniqueId = (
  { chrom, pos, ref, alt, end, geneId }, variantGeneId,
) => `${chrom}-${pos}-${ref ? `${ref}-${alt}` : end}-${variantGeneId || geneId}`

export const getIndividualTaggedVariants = createSelector(
  getTaggedVariantsByFamily,
  getIndividualsByGuid,
  (state, props) => props.individualGuid,
  (taggedVariants, individualsByGuid, individualGuid) => {
    const { familyGuid } = individualsByGuid[individualGuid]
    return Object.values(taggedVariants[familyGuid] || []).reduce((acc, variant) => {
      const variantDetail = {
        ...variant.genotypes[individualGuid],
        ...variant,
      }
      return [...acc, ...variant.genes.map(gene => ({
        ...variantDetail,
        variantId: getVariantUniqueId(variant, gene.geneId),
        ...gene,
      }))]
    }, [])
  },
)

export const getProjectTagTypeOptions = createSelector(
  getProjectGuid,
  getTagTypesByProject,
  (projectGuid, tagTypesByProject) => tagTypesByProject[projectGuid].map(
    ({ name, variantTagTypeGuid, ...tag }) => ({ value: name, text: name, ...tag }),
  ),
)

export const getProjectVariantSavedByOptions = createSelector(
  getProjectFamiliesByGuid,
  getVariantTagNotesByFamilyVariants,
  (familiesByGuid, variantDetailByFamilyVariant) => [null, ...Object.keys(familiesByGuid).reduce(
    (acc, familyGuid) => new Set([
      ...acc,
      ...Object.values(variantDetailByFamilyVariant[familyGuid] || {}).reduce((variantAcc, { tags, notes }) => ([
        ...variantAcc,
        ...(tags || []).map(({ createdBy }) => createdBy),
        ...(notes || []).map(({ createdBy }) => createdBy),
      ]), []),
    ]), new Set(),
  )].map(value => ({ value })),
)

// Family table selectors
export const getFamiliesTableState = createSelector(
  (state, ownProps) => state[`${toCamelcase((ownProps || {}).tableName) || 'family'}TableState`],
  tableState => tableState,
)
export const getFamiliesFilter = createSelector(
  getFamiliesTableState,
  familyTableState => familyTableState.familiesFilter || SHOW_ALL,
)
export const getFamiliesSearch = createSelector(
  getFamiliesTableState,
  familyTableState => familyTableState.familiesSearch,
)
export const getFamiliesSortOrder = createSelector(
  getFamiliesTableState,
  familyTableState => familyTableState.familiesSortOrder || SORT_BY_FAMILY_NAME,
)
export const getFamiliesSortDirection = createSelector(
  getFamiliesTableState,
  familyTableState => familyTableState.familiesSortDirection || 1,
)

const hasFamilySearch = createSelector(
  getFamiliesSearch,
  familiesSearch => !!familiesSearch,
)

const getFamilySearchFields = (family, individualsByGuid) => ([
  family.displayName, family.familyId, (family.assignedAnalyst || {}).fullName, (family.assignedAnalyst || {}).email,
  ...family.analysedBy.map(({ createdBy }) => `${createdBy.fullName}${createdBy.email}`),
  ...family.individualGuids.map(individualGuid => (individualsByGuid[individualGuid].features || []).map(feature => feature.label).join(';')),
])

const getFamiliesBySearchString = createSelector(
  getProjectAnalysisGroupFamiliesByGuid,
  getIndividualsByGuid,
  hasFamilySearch,
  (familiesByGuid, individualsByGuid, shouldSearch) => {
    if (!shouldSearch) {
      return null
    }

    return Object.values(familiesByGuid).reduce((acc, family) => (
      { ...acc, [getFamilySearchFields(family, individualsByGuid).join(';').toLowerCase()]: family }), {})
  },
)
// TODO some filters and sort may not work now
export const getVisibleFamilies = createSelector(
  getProjectAnalysisGroupFamiliesByGuid,
  getFamiliesBySearchString,
  getIndividualsByGuid,
  getSamplesByFamily,
  getUser,
  getFamiliesFilter,
  getFamiliesSearch,
  (
    familiesByGuid, familiesBySearchString, individualsByGuid, samplesByFamily, user, familiesFilter, familiesSearch,
  ) => {
    const searchedFamilies = familiesBySearchString ? Object.keys(familiesBySearchString).filter(
      familySearchString => familySearchString.includes(familiesSearch),
    ).map(familySearchString => familiesBySearchString[familySearchString]) : Object.values(familiesByGuid)

    if (!familiesFilter || !FAMILY_FILTER_LOOKUP[familiesFilter]) {
      return searchedFamilies
    }

    const familyFilter = FAMILY_FILTER_LOOKUP[familiesFilter].createFilter(individualsByGuid, user, samplesByFamily)
    return searchedFamilies.filter(familyFilter)
  },
)

/**
 * function that returns an array of currently-visible family objects, sorted according to
 * currently-selected values of familiesSortOrder and familiesSortDirection.
 *
 * @param state {object} global Redux state
 */
export const getVisibleFamiliesInSortedOrder = createSelector(
  getVisibleFamilies,
  getIndividualsByGuid,
  getSamplesByFamily,
  getFamiliesSortOrder,
  getFamiliesSortDirection,
  (visibleFamilies, individualsByGuid, samplesByFamily, familiesSortOrder, familiesSortDirection) => {
    if (!familiesSortOrder || !FAMILY_SORT_LOOKUP[familiesSortOrder]) {
      return visibleFamilies
    }

    const getSortKey = FAMILY_SORT_LOOKUP[familiesSortOrder](individualsByGuid, samplesByFamily)
    return visibleFamilies.slice(0).sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)) * familiesSortDirection)
  },
)

export const getEntityExportConfig = ({ project, tableName, fileName, fields }) => ({
  filename: `${project.name.replace(' ', '_').toLowerCase()}_${tableName ? `${toSnakecase(tableName)}_` : ''}${fileName}`,
  headers: fields.map(config => config.header),
  processRow: family => fields.map((config) => {
    const val = family[config.field]
    return config.format ? config.format(val) : val
  }),
})

// TODO project page downloads no longer have all data
const getFamiliesExportData = createSelector(
  getVisibleFamiliesInSortedOrder,
  getSamplesByFamily,
  getNotesByFamilyType,
  (visibleFamilies, samplesByFamily, notesByFamilyType) => visibleFamilies.reduce((acc, family) => [...acc, {
    ...family,
    ...FAMILY_NOTES_FIELDS.reduce((noteAcc, { id, noteType }) => (
      { ...noteAcc, [id]: (notesByFamilyType[family.familyGuid] || {})[noteType] }), {}),
    [FAMILY_FIELD_FIRST_SAMPLE]: (samplesByFamily[family.familyGuid] || [])[0],
  }], []),
)

const getIndividualsExportData = createSelector(
  getVisibleFamiliesInSortedOrder,
  getSortedIndividualsByFamily,
  getSamplesByGuid,
  (families, individualsByFamily, samplesByGuid) => families.reduce((acc, family) => [
    ...acc, ...(individualsByFamily[family.familyGuid] || []).map(individual => ({
      ...individual,
      [FAMILY_FIELD_ID]: family.familyId,
      [INDIVIDUAL_HAS_DATA_FIELD]: individual.sampleGuids.some(sampleGuid => samplesByGuid[sampleGuid].isActive),
    }))], []),
)

const getSamplesExportData = createSelector(
  getVisibleFamiliesInSortedOrder,
  getIndividualsByGuid,
  getSamplesByFamily,
  (visibleFamilies, individualsByGuid, samplesByFamily) => visibleFamilies.reduce((acc, family) => [
    ...acc, ...(samplesByFamily[family.familyGuid] || []).map(sample => ({
      ...sample,
      [FAMILY_FIELD_ID]: family.familyId,
      [INDIVIDUAL_FIELD_ID]: individualsByGuid[sample.individualGuid].individualId,
    }))], []),
)

export const getProjectExportUrls = createSelector(
  getCurrentProject,
  (state, ownProps) => (ownProps || {}).tableName,
  getAnalysisGroupGuid,
  (project, tableName, analysisGroupGuid) => {
    const ownProps = { tableName, analysisGroupGuid }
    const isCaseReview = tableName === CASE_REVIEW_TABLE_NAME
    return [
      {
        name: 'Families',
        getRawData: state => getFamiliesExportData(state, ownProps),
        ...getEntityExportConfig({
          project,
          tableName,
          fileName: 'families',
          fields: isCaseReview ? CASE_REVIEW_FAMILY_EXPORT_DATA : FAMILY_EXPORT_DATA,
        }),
      },
      {
        name: 'Individuals',
        getRawData: state => getIndividualsExportData(state, ownProps),
        ...getEntityExportConfig({
          project,
          tableName,
          fileName: 'individuals',
          fields: isCaseReview ? CASE_REVIEW_INDIVIDUAL_EXPORT_DATA : INDIVIDUAL_EXPORT_DATA,
        }),
      },
      {
        name: 'Samples',
        getRawData: state => getSamplesExportData(state, ownProps),
        ...getEntityExportConfig({ project, tableName, fileName: 'samples', fields: SAMPLE_EXPORT_DATA }),
      },
    ]
  },
)

export const getCaseReviewStatusCounts = createSelector(
  getProjectGuid,
  getIndividualsByGuid,
  (projectGuid, individualsByGuid) => {
    const caseReviewStatusCounts = Object.values(individualsByGuid).reduce((acc, individual) => (
      individual.projectGuid === projectGuid ?
        { ...acc, [individual.caseReviewStatus]: (acc[individual.caseReviewStatus] || 0) + 1 } : acc
    ), {})

    return CASE_REVIEW_STATUS_OPTIONS.map(option => ({ ...option, count: (caseReviewStatusCounts[option.value] || 0) }))
  },
)

export const getAnalysisStatusCounts = createSelector(
  getProjectAnalysisGroupFamiliesByGuid,
  (familiesByGuid) => {
    const analysisStatusCounts = Object.values(familiesByGuid).reduce((acc, family) => ({
      ...acc, [family.analysisStatus]: (acc[family.analysisStatus] || 0) + 1,
    }), {})

    return FAMILY_ANALYSIS_STATUS_OPTIONS.map(
      option => ({ ...option, count: (analysisStatusCounts[option.value] || 0) }),
    )
  },
)

export const getDefaultMmeSubmission = createSelector(
  getCurrentProject,
  project => ({
    contactName: project.mmePrimaryDataOwner,
    contactHref: project.mmeContactUrl,
    geneVariants: [],
    phenotypes: [],
  }),
)

export const getMmeResultsBySubmission = createSelector(
  getMmeResultsByGuid,
  getMmeSubmissionsByGuid,
  (mmeResultsByGuid, mmeSubmissionsByGuid) => Object.values(mmeSubmissionsByGuid).reduce((acc, submission) => {
    const { submissionGuid, mmeResultGuids = [] } = submission
    if (!acc[submissionGuid]) {
      acc[submissionGuid] = { active: [], removed: [] }
    }
    mmeResultGuids.forEach((resultGuid) => {
      const result = mmeResultsByGuid[resultGuid]
      const parsedResult = { ...result.matchStatus, ...result }
      if (parsedResult.matchRemoved || mmeSubmissionsByGuid[submissionGuid].deletedDate) {
        acc[submissionGuid].removed.push(parsedResult)
      } else {
        acc[submissionGuid].active.push(parsedResult)
      }
    })
    return acc
  }, { }),
)

export const getMmeDefaultContactEmail = createSelector(
  getMmeResultsByGuid,
  getMmeSubmissionsByGuid,
  getIndividualsByGuid,
  getGenesById,
  getSavedVariantsByGuid,
  getUser,
  (state, ownProps) => ownProps.matchmakerResultGuid,
  (mmeResultsByGuid, mmeSubmissionsByGuid, individualsByGuid, genesById, savedVariants, user, matchmakerResultGuid) => {
    const { patient, geneVariants, submissionGuid } = mmeResultsByGuid[matchmakerResultGuid]
    const {
      geneVariants: submissionGeneVariants, phenotypes, individualGuid, contactHref, submissionId,
    } = mmeSubmissionsByGuid[submissionGuid]
    const { familyGuid } = individualsByGuid[individualGuid]

    const submittedGenes = [...new Set((submissionGeneVariants || []).map(
      ({ geneId }) => (genesById[geneId] || {}).geneSymbol,
    ))]

    const geneName = (geneVariants || []).map(({ geneId }) => (genesById[geneId] || {}).geneSymbol).find(
      geneSymbol => geneSymbol && submittedGenes.includes(geneSymbol),
    )

    const submittedVariants = (submissionGeneVariants || []).map(({ alt, ref, chrom, pos, end, genomeVersion }) => {
      const savedVariant = Object.values(savedVariants).find(
        o => o.chrom === chrom && o.pos === pos && (ref ? o.ref === ref && o.alt === alt : end === o.end) &&
          o.familyGuids.includes(familyGuid),
      ) || {}
      const genotype = (savedVariant.genotypes || {})[individualGuid] || {}
      const mainTranscript = getVariantMainTranscript(savedVariant)
      let consequence = `${(mainTranscript.majorConsequence || '').replace(/_variant/g, '').replace(/_/g, ' ')} variant`
      let variantDetail = [(mainTranscript.hgvsc || '').split(':').pop(), (mainTranscript.hgvsp || '').split(':').pop()].filter(val => val).join('/')
      const displayGenomeVersion = GENOME_VERSION_DISPLAY_LOOKUP[genomeVersion] || genomeVersion
      let inheritance = genotype.numAlt === 1 ? 'heterozygous' : 'homozygous'
      if (genotype.numAlt === -1) {
        inheritance = 'copy number'
        consequence = genotype.cn < 2 ? 'deletion' : 'duplication'
        variantDetail = `CN=${genotype.cn}`
      }
      const position = ref ? `${pos} ${ref}>${alt}` : `${pos}-${end}`
      return `a ${inheritance} ${consequence} ${chrom}:${position}${displayGenomeVersion ? ` (${displayGenomeVersion})` : ''}${variantDetail ? ` (${variantDetail})` : ''}`
    }).join(', ')

    const submittedPhenotypeList = (phenotypes || []).filter(
      ({ observed, label }) => observed === 'yes' && label,
    ).map(({ label }) => label.toLowerCase())
    const numPhenotypes = submittedPhenotypeList.length
    if (numPhenotypes > 2) {
      submittedPhenotypeList[numPhenotypes - 1] = `and ${submittedPhenotypeList[numPhenotypes - 1]}`
    }
    const submittedPhenotypes = submittedPhenotypeList.join(numPhenotypes === 2 ? ' and ' : ', ')

    const contacts = [
      patient.contact.href.replace('mailto:', ''),
      contactHref.replace('mailto:', '').replace('matchmaker@broadinstitute.org,', ''),
      user.email,
    ]
    return {
      matchmakerResultGuid,
      patientId: patient.id,
      to: contacts.filter(val => val).join(','),
      subject: `${geneName || `Patient ${patient.id}`} Matchmaker Exchange connection (${submissionId})`,
      body: `Dear ${patient.contact.name},\n\nWe recently matched with one of your patients in Matchmaker Exchange harboring ${(submissionGeneVariants || []).length === 1 ? 'a variant' : 'variants'} in ${submittedGenes.join(', ')}. Our patient has ${submittedVariants}${submittedPhenotypes ? ` and presents with ${submittedPhenotypes}` : ''}. Would you be willing to share whether your patient's phenotype and genotype match with ours? We are very grateful for your help and look forward to hearing more.\n\nBest wishes,\n${user.displayName}`,
    }
  },
)

// user options selectors
export const getUserOptions = createSelector(
  getUserOptionsByUsername,
  usersOptionsByUsername => Object.values(usersOptionsByUsername).map(
    user => ({ key: user.username, value: user, text: user.email }),
  ),
)

export const getCollaborators = createSelector(
  getCurrentProject,
  project => project.collaborators,
)

// analyst option selectors (add project collaborators to analysts)
export const getAnalystOptions = createSelector(
  getCollaborators,
  getUserOptionsByUsername,
  (collaborators, usersOptionsByUsername) => {
    const analyst = Object.values(usersOptionsByUsername).filter(user => user.isAnalyst)
    const uniqueCollaborators = collaborators.filter(collaborator => !collaborator.isAnalyst)
    return [...uniqueCollaborators, ...analyst].map(
      user => ({ key: user.username, value: user.username, text: user.displayName ? `${user.displayName} (${user.email})` : user.email }),
    )
  },
)

export const getPageHeaderFamily = createSelector(
  getProjectFamiliesByGuid,
  (state, props) => props.match.params.breadcrumbId,
  (familiesByGuid, breadcrumbId) => familiesByGuid[breadcrumbId] || {},
)

export const getPageHeaderAnalysisGroup = createSelector(
  getProjectAnalysisGroupsByGuid,
  (state, props) => props.match.params.breadcrumbId,
  (analysisGroupsByGuid, breadcrumbId) => analysisGroupsByGuid[breadcrumbId] || {},
)

export const getPageHeaderBreadcrumbIdSections = createSelector(
  getCurrentProject,
  getPageHeaderFamily,
  getPageHeaderAnalysisGroup,
  (state, props) => props.breadcrumb || props.match.params.breadcrumb,
  (state, props) => props.match,
  (project, family, analysisGroup, breadcrumb, match) => {
    if (!project) {
      return null
    }

    if (breadcrumb === 'project_page') {
      return []
    }
    if (breadcrumb === 'family_page') {
      const breadcrumbIdSections = [{
        content: `Family: ${family.displayName || ''}`,
        link: `/project/${project.projectGuid}/family_page/${family.familyGuid}`,
      }]
      if (match.params.breadcrumbIdSection) {
        breadcrumbIdSections.push({ content: snakecaseToTitlecase(match.params.breadcrumbIdSection), link: match.url })
      }
      return breadcrumbIdSections
    }
    if (breadcrumb === 'analysis_group') {
      return [{ content: `Analysis Group: ${analysisGroup.name}`, link: match.url }]
    }
    if (breadcrumb === 'saved_variants') {
      const { variantPage, tag } = match.params
      const path = `/project/${project.projectGuid}/saved_variants`
      const breadcrumbIdSections = [{ content: 'Saved Variants', link: path }]
      if (variantPage === 'variant') {
        breadcrumbIdSections.push({ content: 'Variant', link: match.url })
      } else if (variantPage === 'family') {
        breadcrumbIdSections.push({ content: `Family: ${family.displayName}`, link: `${path}/family/${family.familyGuid}` })
        if (tag) {
          breadcrumbIdSections.push({ content: tag, link: `${path}/family/${family.familyGuid}/${tag}` })
        }
      } else if (variantPage === 'analysis_group') {
        breadcrumbIdSections.push({ content: `Analysis Group: ${analysisGroup.name}`, link: `${path}/analysis_group/${analysisGroup.analysisGroupGuid}` })
        if (tag) {
          breadcrumbIdSections.push({ content: tag, link: `${path}/analysis_group/${analysisGroup.analysisGroupGuid}/${tag}` })
        }
      } else if (variantPage) {
        breadcrumbIdSections.push({ content: variantPage, link: match.url })
      }
      return breadcrumbIdSections
    }

    return null
  },
)

const getSearchType = ({ breadcrumb, variantPage }) => {
  if (breadcrumb === 'family_page' || variantPage === 'family') {
    return 'family'
  }
  if (breadcrumb === 'analysis_group' || variantPage === 'analysis_group') {
    return 'analysis_group'
  }
  return 'project'
}

export const getPageHeaderEntityLinks = createSelector(
  getCurrentProject,
  getPageHeaderFamily,
  getPageHeaderAnalysisGroup,
  (state, props) => getSearchType(props.match.params),
  getProjectAnalysisGroupFamiliesByGuid,
  getHasActiveSearchableSampleByFamily,
  (project, family, analysisGroup, searchType, familiesByGuid, hasActiveSearchableSampleByFamilyGuid) => {
    if (!project) {
      return null
    }

    let searchId = project.projectGuid
    if (searchType === 'family') {
      searchId = family.familyGuid
    } else if (searchType === 'analysis_group') {
      searchId = analysisGroup.analysisGroupGuid
    }

    const familiesToConsider = searchType === 'family' ? [family.familyGuid] : Object.keys(familiesByGuid)
    const disabled = familiesToConsider.every(
      familyGuid => !(hasActiveSearchableSampleByFamilyGuid[familyGuid] || {}).isSearchable,
    )
    const entityLinks = [{
      to: `/variant_search/${searchType}/${searchId}`,
      content: `${snakecaseToTitlecase(searchType)} Variant Search`,
      disabled,
      popup: disabled ?
        `Search is disabled until data is loaded${project.workspaceName ? '. Loading data from AnVIL to seqr is a slow process, and generally takes a week.' : ''}` :
        null,

    }]
    if (project.hasCaseReview) {
      entityLinks.push({
        to: `/project/${project.projectGuid}/case_review`,
        content: 'Case Review',
        activeStyle: { display: 'none' },
      })
    }
    return entityLinks
  },
)
