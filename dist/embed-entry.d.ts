import './embed-styles.css';
interface SphereViewerConfig {
    sessionId: string;
    containerId?: string;
    apiBaseUrl?: string;
}
declare class SphereViewer {
    private root;
    private container;
    constructor();
    private autoInitFromScript;
    init(config: SphereViewerConfig): void;
    destroy(): void;
    update(config: Partial<SphereViewerConfig>): void;
}
declare global {
    interface Window {
        SphereViewer: typeof SphereViewer;
    }
}
export default SphereViewer;
