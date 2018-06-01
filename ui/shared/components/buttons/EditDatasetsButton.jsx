import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { Tab } from 'semantic-ui-react'

import { closeModal } from 'redux/utils/modalReducer'
import Modal from '../modal/Modal'
import UploadCallsetForm from '../form/edit-datasets/UploadCallsetForm'
import AddBamPathsForm from '../form/edit-datasets/AddBamPathsForm'
import ButtonLink from './ButtonLink'


const MODAL_NAME = 'Datasets'

const EditDatasetsButton = (props) => {
  const panes = [
    {
      menuItem: 'Upload New Callset',
      pane: <Tab.Pane key={1}><UploadCallsetForm handleClose={props.handleClose} /></Tab.Pane>,
    },
    {
      menuItem: 'Add BAM/CRAM Paths',
      pane: <Tab.Pane key={2}><AddBamPathsForm handleClose={props.handleClose} /></Tab.Pane>,
    },
  ]
  return (
    <Modal
      modalName={MODAL_NAME}
      title="Datasets"
      size="small"
      trigger={<ButtonLink>Edit Datasets</ButtonLink>}
    >
      <Tab
        renderActiveOnly={false}
        panes={panes}
      />
    </Modal>
  )
}

EditDatasetsButton.propTypes = {
  handleClose: PropTypes.func,
}

const mapDispatchToProps = {
  handleClose: () => closeModal(MODAL_NAME),
}

export default connect(null, mapDispatchToProps)(EditDatasetsButton)