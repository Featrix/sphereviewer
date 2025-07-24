import React, { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { v4 as uuid4 } from "uuid";
import {
    initialize_sphere,
    toggle_animation,
    start_animation,
    SphereData,
    register_event_listener,
    change_cluster_count,
    clear_selected_objects,
    remove_selected_record,
    change_object_color,
    clear_colors,
    add_new_embedding,
    show_search_results,
    notify_highlights_changed,
    render_sphere,
    get_object_color_string,
    add_selected_record,
    add_similarity_search_results,
    SphereRecord,
    send_event,
    set_animation_options,
    set_visual_options,
} from './featrix_sphere_control'

import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'

import clsx from 'clsx'

import Spinner from "@/components/spinner";
import { Text } from '@/components/text'

import { BeakerIcon, PlayIcon, PauseIcon, XMarkIcon, MapPinIcon } from '@heroicons/react/20/solid'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { StdioNull } from "child_process";

interface Props {
    data: any;
    jsonData: any;
    recordList: any;
    columnTypes: any;
    isRotating?: boolean;
    rotationSpeed?: number;
    animateClusters?: boolean;
    pointSize?: number;
    pointOpacity?: number;
    onSphereReady?: (sphereRef: any) => void;
}


const kColorTable = [
    0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4,
    0x46f0f0, 0xf032e6, 0xbcf60c, 0xfabebe, 0x008080, 0xe6beff
];

interface ColorPickerProps {
    onSelect?: (color: string) => void;
    initialColor: string | null;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ onSelect, initialColor }) => {

    const get_color = (color: string | null): string => {
        return color ? color : `#${kColorTable[0].toString(16).padStart(6, "0")}`;
    }

    const startingColor = get_color(initialColor);

    const [selectedColor, setSelectedColor] = useState<string>(
        startingColor
    );
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const toggleDropdown = () => setIsOpen(!isOpen);

    const selectColor = (color: string) => {
        setSelectedColor(color);
        setIsOpen(false);
        if (onSelect) onSelect(color);
    };

    // Make sure the color gets updated when the initialColor prop changes
    // as a result of another component changing color.
    // NOTE: I would have thought that this would be handled automatically
    // on re-render, but I suppose not.
    useEffect(() => {
        setSelectedColor(get_color(startingColor));
    }, [initialColor]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div
            ref={dropdownRef}
            className="relative"
        >
            <div
                onClick={toggleDropdown}
                style={{ background: selectedColor }}
                className={clsx([
                    "w-6 h-6 rounded cursor-pointer",
                ])}
            >
            </div>

            {isOpen && (
                <div className="dropdown-menu">
                    {kColorTable.map((colorHex) => {
                        const hexString = `#${colorHex.toString(16).padStart(6, "0")}`;
                        return (
                            <div
                                key={hexString}
                                className="dropdown-item"
                                onClick={() => selectColor(hexString)}
                            >
                                <span
                                    className="color-box"
                                    style={{ background: hexString }}></span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const getAllColumns = (jsonData: any) => {
    const scalars: any = [];
    const sets: any = {};
    const strings: any = [];

    // Iterate over all the records and get the names
    // of all the columns
    const items = jsonData.coords;
    for (var entry of items) {
        if (entry.scalar_columns) {
            const ks = Object.keys(entry.scalar_columns);
            for (var k of ks) {
                if (!scalars.includes(k)) {
                    scalars.push(k)
                }
            }
        }

        if (entry.set_columns) {
            const ks = Object.keys(entry.set_columns);
            for (var k of ks) {
                if (!sets[k]) {
                    sets[k] = [];
                }
                // Update the list of possible values for this set
                if (!sets[k].includes(entry.set_columns[k])) {
                    sets[k].push(entry.set_columns[k]);
                }
            }
        }

        if (entry.string_columns) {
            const ks = Object.keys(entry.string_columns);
            for (var k of ks) {
                if (!strings.includes(k)) {
                    strings.push(k);
                }
            }
        }
    }

    return { scalars: scalars, sets: sets, strings: strings };
}



const FeatrixClusterPicker = ({ sphereRef, jsonData, disabled }: any) => {
    const allClusters = jsonData?.entire_cluster_results || {};

    const clusters  = Object.keys(allClusters).map((k: any) => Number(k))
    const min_cluster = Math.min(...clusters);
    const max_cluster = Math.max(...clusters);

    const ks = Object.keys(allClusters);

    // Default to first cluster
    let init_cluster_number = ks[0]
    if (jsonData?.entire_cluster_results) {
        init_cluster_number = find_best_cluster_number(jsonData?.entire_cluster_results);
    }
    
    const [selectedCluster, setSelectedCluster] = useState(init_cluster_number || "");

    const handleChange = (newCluster: string) => {
        setSelectedCluster(newCluster);
        change_cluster_count(sphereRef.current, jsonData, newCluster);

        notify_highlights_changed(sphereRef.current);
        render_sphere(sphereRef.current);
    }

    return (
        <div className="flex flex-col items-center space-y-4">
            <div className="w-full">
                <input
                    id="slider"
                    type="range"
                    min={min_cluster}
                    max={max_cluster}
                    value={selectedCluster}
                    onChange={(event: any) => handleChange(event.target.value)}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer slider-thumb focus:outline-none"
                />
                <div className="flex justify-between w-full">
                    {Array.from({ length: max_cluster - min_cluster + 1 }, (_, i) => (
                        <div
                            className="flex flex-col items-center justify-start gap-1 w-4 cursor-pointer"
                            onClick={() => handleChange(String(i + min_cluster))}
                        >
                            <div key={i + min_cluster} className="border border-gray-300 border-1 h-2"></div>
                            <div className="text-gray-500 text-xs">{i + min_cluster}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

}


async function encode_record(session_id: string, query_record: any): Promise<SphereRecord> {
    
    // TODO: before we ping the server, let's check if the record is already in the sphere.
    
    const endpoint = `https://sphere-api.featrix.com/compute/session/${session_id}/encode_records`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query_record }),
    });

    console.log(response);

    if (!response.ok) {
        throw new Error("Failed to submit text");
    }

    const result_data = await response.json();

    const record_id = String(uuid4());
    const new_record: SphereRecord = {
        coords: {
            x: result_data.embedding[0],
            y: result_data.embedding[1],
            z: result_data.embedding[2],
        },
        id: record_id,
        featrix_meta: {
            cluster_pre: null,
            webgl_id: null,
            __featrix_row_id: null,
            __featrix_row_offset: null,
        },
        original: result_data.query_record,
    }

    return new_record;
}


const FeatrixManualEmbeddingControl = ({ sphereRef, data, jsonData }: any) => {
    const [text, setText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (event: any) => {
        setText(event.target.value);
    };

    const handleSubmit = async () => {
        if (!text.trim()) {
            alert("Cannot submit empty text!");
            return;
        }

        setIsSubmitting(true);
        try {

            let query_record = null;
            try {
                query_record = JSON.parse(text);
            } catch (error) {
                console.error("Error parsing JSON:", error);
                alert("Please provide a valid JSON object.");
                setIsSubmitting(false);
                return;
            }
            // const session_id = data.session.session_id;
            // const endpoint = `https://sphere-api.featrix.com/compute/session/${session_id}/encode_records`;
            // const response = await fetch(endpoint, {
            //     method: "POST",
            //     headers: {
            //         "Content-Type": "application/json",
            //     },
            //     body: JSON.stringify({ query_record }),
            // });

            // console.log(response);

            // if (!response.ok) {
            //     throw new Error("Failed to submit text");
            // }

            // const result_data = await response.json();

            const new_record = await encode_record(data.session.session_id, query_record);
            console.log("AAAA new_record:", new_record);

            // insert new point into sphere and select it?
            add_new_embedding(sphereRef.current, new_record);
            notify_highlights_changed(sphereRef.current);
            render_sphere(sphereRef.current);
            
            // TODO: add the new point to selection list

        } catch (error) {
            console.error("Error submitting text:", error);
            alert("Failed to submit text");
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        let stuff = getAllColumns(jsonData);
        let object: any = {};

        Object.keys(stuff.sets).map((entry) => object[entry] = null);
        stuff.scalars.map((entry: any) => object[entry] = null);
        stuff.strings.map((entry: any) => object[entry] = null);

        setText(JSON.stringify(object, null, 4));
    }, [jsonData]);


    return (
        <div style={{ padding: "10px", borderBottom: "1px solid #33333366" }}>
            <Text>Fill in one or more values. Leave as many fields as you want null, but you must fill in at least one field.</Text>
            <textarea value={text} onChange={handleChange} rows={5} cols={30} />
            <br />
            <Button outline onClick={handleSubmit} disabled={isSubmitting}><><BeakerIcon /> plot it</>
            </Button>
        </div>
    );
}


function filter_record_list(sphere: SphereData, queryColumnType: any, queryColumn: any, queryValue: any) {

    let results: any = [];

    // Iterate over all records and check if the queryValue is in the queryColumn
    for (const record of sphere.pointRecordsByID.values()) {
        
        const columnValue = record.original[queryColumn];
        
        // There's no value in this column for this record,
        // so move on.
        if (columnValue === undefined) {
            continue;
        }
        
        if (queryColumnType === 'string') {
            // These should be strings, but convert just in case
            const value = String(columnValue).toLowerCase();
            const query = String(queryValue).toLowerCase();

            if (value.includes(query)) {
                results.push(record);
            }
        }

        else if (queryColumnType === 'set') {
            // Convert to strings for comparison. Set values
            // could be e.g. integers
            const value = String(columnValue).toLowerCase();
            const query = String(queryValue).toLowerCase();
            
            if (value === query) {
                results.push(record);
            }
        }
    }

    return results;
}

const FeatrixSphereColorControls = ({ sphereRef, columnTypes }: any) => {

    const initialSelectedColumn = Object.keys(columnTypes)[0];

    const [colList, setColList] = useState<string[]>([]);
    const [selectedColumn, setSelectedColumn] = useState(initialSelectedColumn);

    useEffect(() => {
        if (!columnTypes) {
            return;
        }

        if (columnTypes) {
            setColList(Object.keys(columnTypes));
        }

    }, [columnTypes]);

    const onInput = (e: any) => {
        const inputValue = e.target.value;

        // If the input is empty, clear the colors and render the sphere.
        // We don't want to match to an empty string because it matches
        // everything.
        if (inputValue === "") {
            clear_colors(sphereRef.current);
            render_sphere(sphereRef.current);
            notify_highlights_changed(sphereRef.current);
            return;
        }

        const queryColumnType = columnTypes[selectedColumn];
        const theRecords = filter_record_list(sphereRef.current, queryColumnType, selectedColumn, inputValue);

        show_search_results(sphereRef.current, theRecords)
        render_sphere(sphereRef.current);
        notify_highlights_changed(sphereRef.current);
    }

    return (
        <div style={{ padding: "10px", borderBottom: "1px solid #33333366" }}>
            <div className="text-gray-500">
                <select value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)}>
                    {colList.map((entry) => 
                        (
                            <option key={entry}>{entry}</option>
                        )
                    )}
                </select>

                <input style={{marginLeft: "8px"}} type="text" onChange={onInput}/>
            </div>
        </div>
    )
}

type HighlightedObjectRowProps = {
    sphereRef: any, 
    recordId: string,
    sessionId: string,
}


const HighlightedObjectRow = ({ sphereRef, sessionId, recordId }: HighlightedObjectRowProps) => {

    const record = sphereRef.current.pointRecordsByID.get(recordId);
    const object = sphereRef.current.pointObjectsByRecordID.get(recordId);

    const fields = sphereRef.current === null ? [] : sphereRef.current.recordFields;

    const initialColor = get_object_color_string(object);

    const [color, setColor] = useState(initialColor);

    // If the color of the object is changed by someone else, we want to 
    // know about it.
    useEffect(() => {
        const evt_callback = (event: any) => {
            setColor(get_object_color_string(object));
        };

        const remove_callback = register_event_listener(
            sphereRef.current,
            'highlightedObjectChanged',
            evt_callback,  
        )

        return remove_callback;
    })    

    const onSimilaritySearch = async () => {
        const record_id = record.id;
        // const record_data = record.original;

        if (!showSimilar) {

            // Get pre-fetched similar records, if they exist.
            let similar_record_ids = sphereRef.current.similaritySearchResults.get(recordId);
            if (!similar_record_ids) {
                similar_record_ids = await fetch_similar_records(sphereRef.current, sessionId, record);
                if (similar_record_ids === null) {
                    alert("Failed to get similar records");
                    return;
                }
            }
            
            add_similarity_search_results(sphereRef.current,  record_id, similar_record_ids);
            setShowSimilar(true);
            
            send_event(
                sphereRef.current,
                'similaritySearchResultsUpdated',
                {"detail": sphereRef.current.similaritySearchResults},
            );

            // clear_selected_objects(sphereRef.current);
            // add_selected_record(sphereRef.current, record_id);
            // for (const record_id of similar_record_ids) {
            //     add_selected_record(sphereRef.current, record_id);
            // }
            // notify_highlights_changed(sphereRef.current);

            clear_colors(sphereRef.current);
            change_object_color(sphereRef.current, recordId, "#000000");
            for (const record_id of similar_record_ids) {
                change_object_color(sphereRef.current, record_id, "#FF0000");
            }
            notify_highlights_changed(sphereRef.current);
            render_sphere(sphereRef.current);

        } else {
            clear_colors(sphereRef.current);
            change_object_color(sphereRef.current, recordId, "#000000");
            notify_highlights_changed(sphereRef.current);
            render_sphere(sphereRef.current);
            setShowSimilar(false);
        }
    }    

    const onRemoveClick = () => {
        remove_selected_record(sphereRef.current, recordId);
        
        notify_highlights_changed(sphereRef.current);
        render_sphere(sphereRef.current);
    }
    const onPickColor = (color: string) => {
        change_object_color(sphereRef.current, recordId, color);
        
        notify_highlights_changed(sphereRef.current);
        render_sphere(sphereRef.current);
    }

    const [similarIds, setSimilarIds] = useState<string[]>([]);

    const [showSimilar, setShowSimilar] = useState<boolean>(false);


    useEffect(() => {
        if (!sphereRef.current) return;

        const evt_callback = (event: {detail: Map<string, Array<string>>}) => {
            console.log("AAA similaritySearchResultsUpdated:", event.detail);
            
            const simSearchResultsNew = new Array<{anchor: SphereRecord, similar: SphereRecord[]}>();

            if (sphereRef.current.similaritySearchResults.has(recordId)) {
                const similar_ids = sphereRef.current.similaritySearchResults.get(recordId);
                setSimilarIds(similar_ids);
            }
        };

        const remove_listener = register_event_listener(
            sphereRef.current,
            'similaritySearchResultsUpdated',
            evt_callback,  
        )

        return remove_listener;
    })  

    return (
        <>
        <TableRow key={recordId}>
            <TableCell>
                <Button plain onClick={onRemoveClick}><XMarkIcon /></Button>
            </TableCell>
            <TableCell>
                <Button outline onClick={onSimilaritySearch}>
                    {showSimilar? "hide " : "show "} 
                    similar
                    {/* <MapPinIcon /> */}
                </Button>
            </TableCell>
            <TableCell>
                <ColorPicker 
                    onSelect={onPickColor}
                    initialColor={color} 
                />
            </TableCell>
            {
                fields.map((field: any) => (
                    <TableCell key={field}>
                        {record.original[field]}
                    </TableCell>
                ))
            }

        </TableRow>

        {
            similarIds.length > 0 && showSimilar &&
            similarIds.map((record_id: string) => (
                <HighlightedObjectRow2 
                    key={record_id} 
                    sphereRef={sphereRef}
                    sessionId={sessionId}
                    recordId={record_id}
                />
            ))
        }
        </>
    )
}


const HighlightedObjectRow2 = ({ sphereRef, sessionId, recordId }: HighlightedObjectRowProps) => {

    const record = sphereRef.current.pointRecordsByID.get(recordId);
    const object = sphereRef.current.pointObjectsByRecordID.get(recordId);
    if (!object) {
        return null;
    }

    const fields = sphereRef.current === null ? [] : sphereRef.current.recordFields;

    const initialColor = get_object_color_string(object);

    const [color, setColor] = useState(initialColor);

    // If the color of the object is changed by someone else, we want to 
    // know about it.
    useEffect(() => {
        const evt_callback = (event: any) => {
            setColor(get_object_color_string(object));
        };

        const remove_callback = register_event_listener(
            sphereRef.current,
            'highlightedObjectChanged',
            evt_callback,  
        )

        return remove_callback;
    })    

    const onPickColor = (color: string) => {
        change_object_color(sphereRef.current, recordId, color);
        
        notify_highlights_changed(sphereRef.current);
        render_sphere(sphereRef.current);
    }

    return (

        <TableRow key={recordId}>
            <TableCell>
            </TableCell>
            <TableCell>
            </TableCell>
            <TableCell>
                <ColorPicker 
                    onSelect={onPickColor} 
                    initialColor={color} 
                />
            </TableCell>
            {
                fields.map((field: any) => (
                    <TableCell key={field}>
                        {record.original[field]}
                    </TableCell>
                ))
            }
        </TableRow>
    )
}


const FeatrixSphereMouseOverPanel = ({ sphereRef, sessionId, selectedRecords }: { sphereRef: any, sessionId: any, selectedRecords: any[] }) => {

    const onResetClick = () => {
        clear_selected_objects(sphereRef.current);

        notify_highlights_changed(sphereRef.current);
        render_sphere(sphereRef.current);
    }

    const allFields: string[] = sphereRef.current === null ? [] : sphereRef.current.recordFields;

    return (
        <div
            className="text-gray-500 flex flex-col gap-6"
        >
            <div className="flex w-full flex-wrap items-center justify-between gap-4 border-b border-zinc-950/10 pb-2 dark:border-white/10">
                <Subheading>Selected Points</Subheading>
                <div className="flex gap-4">
                    {
                        selectedRecords.length > 0 &&
                        <Button outline onClick={onResetClick}>clear all</Button>
                    }
                </div>
            </div>

            {selectedRecords.length > 0 ? (
                <Table dense striped className="mx-auto [--gutter:theme(spacing.6)] sm:[--gutter:theme(spacing.8)] pb-48">
                    <TableHead>
                        <TableRow>
                            <TableHeader></TableHeader>
                            <TableHeader></TableHeader>
                            <TableHeader>Color</TableHeader>
                            {
                                allFields.map((field) => <TableHeader key={field}>{field}</TableHeader>)
                            }
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {selectedRecords.map(( recordId: string) => (
                            <HighlightedObjectRow 
                                key={recordId} 
                                sphereRef={sphereRef}
                                sessionId={sessionId}
                                recordId={recordId}
                            />
                        ))}
                    </TableBody>
                </Table>
            ) : (
                <Text className="text-center my-4">
                    Click on a point on the sphere to view more details.
                </Text>
            )
            }

        </div>
    );
};

const ChevronToggleGroup = ({ sphereRef, data, jsonData, columnTypes }: any) => {
    const [openGroup, setOpenGroup] = useState("group1");

    const toggleGroup = (group: any) => {
        setOpenGroup(openGroup === group ? null : group);
    };

    const clearColors = () => {
        clear_colors(sphereRef.current);
        render_sphere(sphereRef.current);
        notify_highlights_changed(sphereRef.current);
    }

    return (
        <div className="text-gray-500 flex flex-col gap-6">
            <div className="flex w-full flex-wrap items-center justify-between gap-4 border-b border-zinc-950/10 pb-2 dark:border-white/10">
                <Subheading>Color Settings</Subheading>
                <div className="flex gap-4">
                    <Button outline onClick={clearColors}>reset</Button>
                </div>
            </div>

            {/* Color by cluster */}
            { jsonData?.entire_cluster_results &&
                <div className="flex flex-col gap-4">
                    <div
                        onClick={() => toggleGroup("group1")}
                        className="flex cursor-pointer items-center"
                    >
                        {openGroup === "group1" ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <span style={{ marginLeft: "5px", fontWeight: openGroup === "group1" ? "bold" : "normal" }}>Color by cluster</span>
                    </div>
                    {openGroup === "group1" && (
                        <div className="pl-6">
                            <FeatrixClusterPicker
                                sphereRef={sphereRef}
                                disabled={openGroup !== "group1"}
                                jsonData={jsonData} 
                            />
                        </div>
                    )}
                </div>
            }

            {/* Color by value */}
            <div className="flex flex-col gap-4">
                <div
                    onClick={() => toggleGroup("group2")}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                        marginTop: "10px",
                    }}
                >
                    {openGroup === "group2" ? (
                        <ChevronDownIcon className="h-5 w-5" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5" />
                    )}
                    <span style={{ marginLeft: "5px", fontWeight: openGroup === "group2" ? "bold" : "normal" }}>Color by value</span>
                </div>
                {openGroup === "group2" && (
                    <div className="pl-6">
                        <FeatrixSphereColorControls
                            sphereRef={sphereRef}
                            columnTypes={columnTypes} />
                    </div>
                )}
            </div>


            {/* Add a new point */}
            <div className="flex flex-col gap-4">
                <div
                    onClick={() => toggleGroup("group3")}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                        marginTop: "10px",
                    }}
                >
                    {openGroup === "group3" ? (
                        <ChevronDownIcon className="h-5 w-5" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5" />
                    )}
                    <span style={{ marginLeft: "5px", fontWeight: openGroup === "group3" ? "bold" : "normal" }}>Add new point</span>
                </div>
                {openGroup === "group3" && (
                    <div className="pl-6">
                        <FeatrixManualEmbeddingControl
                            sphereRef={sphereRef}
                            data={data}
                            jsonData={jsonData} />
                    </div>
                )}
            </div>

        </div>
    );
};


async function fetch_similar_records(sphere: SphereData, sessionId: string, query_record: SphereRecord) {
    let endpoint = `https://sphere-api.featrix.com/compute/session/${sessionId}/similarity_search`;

    let data: any = null;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query_record: query_record.original }),
        });

        if (!response.ok) {
            console.error("Failed to get similar records");
            return null;
        }

        data = await response.json();
        console.log("similar records:", data);

    } catch (error) {
        console.error("Error getting similar records:", error);
        return null
    }

    // Get the record ids of the similar records
    const record_ids = new Array();
    data.results.forEach((record: any) => {
        const row_id = record.__featrix_row_id;
        let record_id = null
        for (const [key, value] of sphere.pointRecordsByID.entries()) {
            if (value.featrix_meta.__featrix_row_id === row_id) {
                record_id = key;
                break;
            }
        }
        if (record_id === null) {
            console.error("Could not find record id for row id:", row_id);
        } 
        else if (record_id === query_record.id) {
            console.error("Got the same record as the query record");
        }
        else {
            record_ids.push(record_id);
        }
    })

    return record_ids
}


export function find_best_cluster_number(clusterInfoByClusterCount: any): string {
    let cluster_with_best_score = '2';
    let best_score = 1e9;
    Object.entries(clusterInfoByClusterCount).forEach(([key, value]: any) => {
        if (value.score < best_score) {
            best_score = value.score;
            cluster_with_best_score = key;
        }
    })

    return cluster_with_best_score;
}


const FeatrixEmbeddingsExplorer: React.FC<Props> = ({ recordList, columnTypes, data, jsonData, isRotating = true, rotationSpeed = 0.1, animateClusters = false, pointSize = 0.05, pointOpacity = 0.5, onSphereReady }: any) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sphereRef = useRef<SphereData | null>(null);

    const [isAnimating, setIsAnimating] = useState<boolean>(false);
    const [selectedRecords, setselectedRecords] = useState<any[]>([]);

    useEffect(() => {
        if (!jsonData) return;
        if (!containerRef.current) {
            return;
        }

        if (!sphereRef.current) {
            sphereRef.current = initialize_sphere(containerRef.current, recordList);
            render_sphere(sphereRef.current);
            
            // Set up animation options
            set_animation_options(sphereRef.current, isRotating, rotationSpeed, animateClusters, jsonData);
            
            // Set up visual options
            set_visual_options(sphereRef.current, pointSize, pointOpacity);
            
            setIsAnimating(sphereRef.current.isAnimating);
            
            // Notify parent that sphere is ready
            if (onSphereReady) {
                onSphereReady(sphereRef.current);
            }
            
            register_event_listener(
                sphereRef.current,
                'highlightedObjectChanged',
                (event: any) => {
                    // Make a copy of the list we get from even detail, to
                    // make sure the FeatrixSphereMouseOverPanel component re-renders.
                    setselectedRecords([...event.detail]);
                }
            )
        }

        if (jsonData?.projections?.entire_cluster_results) {
            const best_cluster_number = find_best_cluster_number(jsonData.projections?.entire_cluster_results);
            console.log("best cluster number = ", best_cluster_number);
            change_cluster_count(sphereRef.current, jsonData, best_cluster_number);
            notify_highlights_changed(sphereRef.current);
            render_sphere(sphereRef.current);
        }
    }, [jsonData]);

    const onButtonClick = () => {
        if (!sphereRef.current) return;

        toggle_animation(sphereRef.current);
        setIsAnimating(sphereRef.current.isAnimating);
    }

    const onResetClick = () => {
        if (!sphereRef.current) return;

        clear_selected_objects(sphereRef.current);
        notify_highlights_changed(sphereRef.current);
        render_sphere(sphereRef.current);
    }

    return (
        <>
            <div className="flex flex-col w-auto gap-4 xl:flex-row">
                <div className="bg-gray-100 xp-4 rounded-lg shadow-lg w-auto sm:w-[35rem] sm:mx-auto relative h-[25rem] sm:h-[35rem] overflow-hidden">
                    {
                        jsonData ? (
                            <>
                                <div ref={containerRef} className="h-full w-full"></div>
                                <div className="absolute top-4 left-4 text-gray-400">
                                    <Button outline onClick={onButtonClick}>
                                        {isAnimating ? <PauseIcon /> : <PlayIcon />}
                                    </Button>
                                </div>
                                {
                                    selectedRecords.length > 0 && (
                                        <div className="absolute top-4 right-4 text-gray-400">
                                            <Button outline onClick={onResetClick}>
                                                clear all
                                            </Button>
                                        </div>
                                    )
                                }
                            </>
                        ) : (
                            <div className="flex flex-col gap-4 h-full w-full my-auto mx-auto justify-center items-center">
                                <Spinner size={32} />
                                <Text>Loading Data</Text>
                            </div>
                        )
                    }
                </div>

                {jsonData &&
                    <div className="bg-gray-100 p-4 rounded-lg shadow-lg grow-1 w-auto sm:w-[35rem] sm:mx-auto">
                        <ChevronToggleGroup
                            sphereRef={sphereRef}
                            data={data}
                            jsonData={jsonData}
                            columnTypes={columnTypes}
                        />
                    </div>
                }
            </div>
            {
                jsonData &&
                <>
                    <div className="bg-gray-100 p-4 rounded-lg shadow-lg ">
                        <FeatrixSphereMouseOverPanel
                            selectedRecords={selectedRecords}
                            sphereRef={sphereRef} 
                            sessionId={data.session.session_id}
                        />
                    </div>

                </>
            }
        </>


    );
};

export default FeatrixEmbeddingsExplorer;
