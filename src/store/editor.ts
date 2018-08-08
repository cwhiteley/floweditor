import { DragPoint } from '~/components/flow/node/Node';
import { FlowPosition } from '~/flowTypes';
import { Asset } from '~/services/AssetService';
import ActionTypes, { UpdateEditorState } from '~/store/actionTypes';
import Constants from '~/store/constants';
import { RenderNode } from '~/store/flowContext';

// tslint:disable:no-shadowed-variable
export interface DragSelection {
    startX?: number;
    startY?: number;
    currentX?: number;
    currentY?: number;
    selected?: { [uuid: string]: boolean };
}

export interface EditorState {
    language: Asset;
    translating: boolean;
    fetchingFlow: boolean;
    nodeEditorOpen: boolean;
    createNodePosition: FlowPosition;
    pendingConnection: DragPoint;
    nodeDragging: boolean;
    ghostNode: RenderNode;
    dragGroup: boolean;
    dragSelection: DragSelection;
}

// Initial state
export const initialState: EditorState = {
    translating: false,
    language: null,
    fetchingFlow: false,
    nodeEditorOpen: false,
    createNodePosition: null,
    pendingConnection: null,
    nodeDragging: false,
    ghostNode: null,
    dragSelection: null,
    dragGroup: false
};

// Action Creator
export const updateEditorState = (editorState: EditorState): UpdateEditorState => ({
    type: Constants.UPDATE_EDITOR_STATE,
    payload: {
        editorState
    }
});

/* Reducer */
export const editorState = (editorState: EditorState = initialState, action: ActionTypes) => {
    switch (action.type) {
        case Constants.UPDATE_EDITOR_STATE:
            return action.payload.editorState;
        default:
            return editorState;
    }
};

// export our reducer
export default editorState;
