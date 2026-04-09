/**
 * Converts the clean public ProjectionData type into the internal server
 * data format that the viewer's rendering pipeline expects.
 */
import type { ProjectionData } from './types';
/**
 * Convert ProjectionData to the internal format expected by the viewer.
 * If the data is already in internal format, returns it as-is.
 */
export declare function convertProjectionData(data: ProjectionData | any): any;
