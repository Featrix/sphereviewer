'use client'

import React, { Suspense, useEffect, useRef, useState } from "react";

import { Text } from '@/components/text'
import FeatrixEmbeddingsExplorer, { find_best_cluster_number } from './featrix_sphere_display'
import TrainingStatus from './training_status'

import { fetch_session_data, fetch_session_projections } from './data_access'

import { SphereRecord, SphereRecordIndex, remap_cluster_assignments } from './featrix_sphere_control'
import { v4 as uuid4 } from 'uuid';


// Function to read a JSON object from localStorage by folder and session ID
function readFromLocalStorage(collection: string, sessionId: string) {   
    try {
        const key = `${collection}_${sessionId}`;  // Create a unique key using folder and sessionId
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;  // Parse the JSON string back into an object
    } catch (error) {
        // Most errors here occur if a component using this function
        // is used on the server side, where localStorage is not available.
        console.error("Error loading items from local storage, returning `null`.")
        return null;
    }
}

// Function to write a JSON object to localStorage by folder and session ID
function writeToLocalStorage(collection: string, sessionId: string, jsonObject: any) {
    const key = `${collection}_${sessionId}`;  // Create a unique key using folder and sessionId
    const data = JSON.stringify(jsonObject);  // Convert the object to a JSON string
    try {
        localStorage.setItem(key, data);  // Store the string in localStorage
    } catch {
        console.error("error saving items to local storage.")
    }
}


const getColumnTypes = (projections: any) => {
    try {
        var d: any = {};
        const items = projections.coords;
        console.log("items = ", items);
        for (var entry of items) {
            if (entry.scalar_columns) {
                const ks = Object.keys(entry.scalar_columns);
                for (var k of ks) {
                    if (d[k] === undefined) {
                        d[k] = 'scalar';            // XXX: want to get distribution description
                    }
                }
            }

            if (entry.set_columns) {
                const ks = Object.keys(entry.set_columns);
                for (var k of ks) {
                    if (d[k] === undefined) {
                        d[k] = 'set';               // XXX: want to get the valid items
                    }
                }
            }

            if (entry.string_columns) {
                const ks = Object.keys(entry.string_columns);
                for (var k of ks) {
                    if (d[k] === undefined) {
                        d[k] = 'string';
                    }
                }
            }
        }

        return d
    } catch (error) {
        console.error("Error getting column types:", error);
        return null;
    }
}


function create_record_list(server_data: any): SphereRecord[] {

    // var table_meta = getColumnTypes(projections)
    //     //columns : type
    //     // training_time, etc.
    //     // num_rows,
    //     // num_cols, 
    //     // epochs,
    //     // detectors: ...
    //     // desc_stats
    // console.log("table_meta = ", table_meta);

    console.log("server_data = ", server_data);

    let recordIndex: Array<SphereRecord> = new Array();

    if (!server_data) {
        return recordIndex;
    }

    for (let entry of server_data?.coords) {
        const uuid = String(uuid4());
        const sphere_record = {
            coords: {
                x: entry[0],
                y: entry[1],
                z: entry[2],
            },
            id: uuid,
            featrix_meta: {
                cluster_pre: entry.cluster_pre,
                webgl_id: null,
                __featrix_row_id: entry.__featrix_row_id,
                __featrix_row_offset: entry.__featrix_row_offset,
            },
            original: {
                ...(entry.set_columns || {}),
                ...(entry.scalar_columns || {}),
                ...(entry.string_columns || {})
            },
        };

        recordIndex.push(sphere_record);
    }

    console.log("recordIndex = ", recordIndex);
    return recordIndex;

}

function remap_server_cluster_assignments(clusterInfoByClusterCount: any) {
    // MODIFIES clusterInfoByClusterCount IN PLACE
    
    // This function remaps the cluster assignments so that the cluster assignments are consistent across different cluster numbers.
    // Clustering algorithms can assign different cluster numbers to the same cluster, so we need to remap the cluster assignments to be consistent.
    // This is VERY important for visual clarity in the UI when the user changes the number of clusters.
    // Without this, the clusters will appear to jump around when the user changes the number of clusters.
    // With this, the user gets a much better sense for the structure of the clusters

    if (!clusterInfoByClusterCount) {
        return;
    }

    const max_clusters = Object.keys(clusterInfoByClusterCount).length;
    for (let base_n_clusters = 2; base_n_clusters < max_clusters + 1; base_n_clusters++) {
        
        const base_clusters = clusterInfoByClusterCount[base_n_clusters].cluster_labels;
        const new_clusters = clusterInfoByClusterCount[base_n_clusters + 1].cluster_labels;
     
        const remap = remap_cluster_assignments(base_clusters, new_clusters);
        clusterInfoByClusterCount[base_n_clusters + 1].cluster_labels = new_clusters.map((label: number) => remap[label]);
    }
}

function fix_server_cluster_pre_assignments(serverData: any) {


    const clusterInfoByClusterCount = serverData?.entire_cluster_results;

    const best_cluster_number = find_best_cluster_number(clusterInfoByClusterCount);
    const best_cluster_idxs = clusterInfoByClusterCount[best_cluster_number].cluster_labels;

    serverData.coords.forEach((entry: any) => {
        const row_offset = entry.__featrix_row_offset;
        const new_cluster = best_cluster_idxs[row_offset];
        entry.cluster_pre = new_cluster;
    });
}


export default function FeatrixSphere({ initial_data }: { initial_data: any }) {
    const init_projections = readFromLocalStorage("projections", initial_data.session.session_id);
    if (init_projections){
        remap_server_cluster_assignments(init_projections?.entire_cluster_results);
        fix_server_cluster_pre_assignments(init_projections);
    }
    const init_record_list = create_record_list(init_projections);


    const [recordList, setRecordList] = useState<SphereRecord[]>(init_record_list);
    const [columnTypes, setColumnTypes] = useState(null);


    const [sessionData, setSessionData] = useState(initial_data);
    const [projections, setProjections] = useState(init_projections);
    const [isDone, setIsDone] = useState(initial_data.session.done); // State to track if polling should stop
    const [isFailed, setIsFailed] = useState(initial_data.session.failed); // State to track if polling should stop
    
    const session_id = initial_data.session.session_id;

    useEffect(() => {
        if (isDone) return; // Stop polling if done
        if (isFailed) return; // Stop polling if failed

        // Function to fetch progress from the API
        const fetchProgress = async () => {
            try {
                // rename to session_data
                const server_session_data = await fetch_session_data(session_id); // Replace with your endpoint
                writeToLocalStorage("session", session_id, server_session_data);

                const is_done = server_session_data.session.status === "done";
                const is_failed = server_session_data.session.status === "failed";
                if (is_done) {
                    setIsDone(true); // Mark as done to stop polling

                    const projections = await fetch_session_projections(session_id);
                    writeToLocalStorage("projections", session_id, projections);
                    if (projections) {
                        remap_server_cluster_assignments(projections?.entire_cluster_results);
                        fix_server_cluster_pre_assignments(projections);
                    }

                    console.log("projections:", projections);
                    console.log("session is done, stopping intervals")

                    const recordList = create_record_list(projections);
                    const columnTypes = getColumnTypes(projections);
                    setRecordList(recordList);
                    setColumnTypes(columnTypes);

                    setProjections(projections);
                    setSessionData(server_session_data);
                } else if (is_failed) {
                    setIsFailed(true);
                    setSessionData(server_session_data);
                } else {
                    setSessionData(server_session_data); // Update progress state if still in progress
                }

            } catch (error) {
                console.error('Error fetching progress:', error);
            }
        };

        // Polling every 2 seconds
        const intervalId = setInterval(fetchProgress, 2000);

        // Cleanup function to clear the interval
        return () => clearInterval(intervalId);
    }, [isDone]); // Re-run effect only if `isDone` changes

    console.log("Internal data:", sessionData)

    const is_done = sessionData.session.status === "done";

    return (
        <>
            <div className="mx-auto">
                {!is_done && <TrainingStatus data={sessionData} />}

                {/* This line below is for testing - uncomment to view the loading widget regardless of state. */}
                {/* <TrainingStatus data={sessionData} /> */}
            </div>

            {is_done && (
                <FeatrixEmbeddingsExplorer 
                    data={sessionData} 
                    jsonData={projections}
                    columnTypes={columnTypes}
                    recordList={recordList}
                />
            )}
        </>
    )

}