/**
 * @featrix/sphere-viewer — v2.0
 *
 * Main React component
 */
export { default as FeatrixSphereViewer } from './FeatrixSphereViewerApp';
export { default as FeatrixSphereEmbedded } from './FeatrixSphereEmbedded';

// Data adapter for converting clean types to internal format
export { convertProjectionData } from './data-adapter';

// All public types
export type {
    ProjectionData,
    EpochFrame,
    PointCoord,
    ClusterResults,
    ClusterInfo,
    ClusterSignature,
    DistinguishingFeature,
    ScalarDetail,
    CategoricalDetail,
    SubFeatureDetail,
    ColumnMIRanking,
    FieldRanking,
    RowData,
    ClusterDetail,
    EpochData,
    PointInfo,
    OnRequestRows,
    OnRequestClusterDetail,
    OnRequestMorePoints,
    OnRequestEpochs,
    OnPointClick,
    OnPointsSelected,
    OnClusterFocused,
    OnFrameChange,
    SphereViewerProps,
} from './types';
