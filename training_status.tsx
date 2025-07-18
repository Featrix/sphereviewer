import Spinner  from '@/components/spinner'

import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { TextColor, TextLink, Text } from '@/components/text'
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { useState } from 'react';
import { Subheading } from '@/components/heading'


// const steps = [
//   { name: 'Train model', description: 'Training a custom model on your data.', href: '#', status: 'complete', progress: null },
//   {
//     name: 'Find clusters',
//     description: 'Identifying meaningful groups in your data.',
//     href: '#',
//     status: 'running',
//     progress: 0.234,
//   },
//   {
//     name: 'Find clusters2',
//     description: 'Identifying meaningful groups in your data.',
//     href: '#',
//     status: 'ready',
//     progress: null,
//   },
//   { name: 'Create Vector DB', description: 'Making your embeddings easy to access.', href: '#', status: 'unscheduled', progress: null},
// ]

function classNames(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}


function EmailNotification({ sessionId }: any) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const handleSubmit = async () => {
        if (!email.trim()) return; // Prevent empty submissions
        setLoading(true);

        try {
            const response = await fetch(`https://sphere-api.featrix.com/compute/session/${sessionId}/notify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "to_address": email, session_id: sessionId }),
            });

            const result = await response.json();
            setMessage(result.message || "You're all set. We'll email you when the sphere is ready.");
        } catch (error) {
            setMessage("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="text-gray-600 p-4 rounded-lg bg-gray-100 shadow-lg mt-4">
            <Subheading>Running to a meeting? No problem.</Subheading>
            <Text>We can send you an email when this training is done.</Text>


            <div className="mt-3 flex items-center gap-2">
                <input
                    name="email"
                    autoComplete='email'
                    inputMode='email'
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                />
                <button
                    onClick={handleSubmit}
                    className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition flex items-center gap-1 disabled:bg-gray-400"
                    disabled={loading}
                >
                    {loading ? "..." : <PaperAirplaneIcon  className="h-5 w-5" />}
                </button>
            </div>

            {message && <Text className="text-sm mt-2 text-gray-600">{message}</Text>}
        </div>
    );
}


export default function TrainingStatus({data}: {data: any}) {

    console.log("TrainingStatus data:" ,data);

    const session = data.session;
    const is_failed = session.status === "failed";

    const jobs = data.session.job_plan;

    const job_descriptions = jobs.map((job_planned: any) => {
        const job_id = job_planned.job_id;
        const job_type = job_planned.job_type;

        const job_record = data.jobs[job_id];

        const job_queue_position = data?.job_queue_positions[job_id];

        let status = null;
        let progress = null;
        let current_loss = null;
        let validation_loss = null;
        let current_epoch = null;
        if (job_record === undefined) {
            status = "unscheduled";
            progress = null;
        } else {
            status = job_record.status;
            // Fix percentage issue: show 100% when job is done
            progress = status === "done" ? 1.0 : job_record.progress;
            
            // Extract training metrics for display
            current_loss = job_record.current_loss;
            validation_loss = job_record.validation_loss;
            current_epoch = job_record.current_epoch;
        }

        if (job_type === "create_structured_data") {
            return {
                name: 'Prepare data',
                description: 'Structuring your data for analysis.',
                href: '#',
                status: status,
                progress: progress,
                job_queue_position: job_queue_position,
            }
        }

        else if (job_type === "train_es") {
            return {
                name: 'Train model',
                description: 'Training a custom model on your data.',
                href: '#',
                status: status,
                progress: progress,
                job_queue_position: job_queue_position,
                current_loss: current_loss,
                validation_loss: validation_loss,
                current_epoch: current_epoch,
            }
        } 
        
        else if (job_type === "train_knn") {
            return {
                name: 'Find clusters',
                description: 'Identifying meaningful groups in your data.',
                href: '#',
                status: status,
                progress: progress,
                job_queue_position: job_queue_position,
            }
        } 
        
        else if (job_type === "build_es_projections") {
            return {
                name: 'Create Vector DB',
                description: 'Making your embeddings easy to access.',
                href: '#',
                status: status,
                progress: progress,
                job_queue_position: job_queue_position,
            }
        }
        
        else if (job_type === "train_single_predictor") {
            return {
                name: 'Train predictor',
                description: 'Training a predictor for your target column.',
                href: '#',
                status: status,
                progress: progress,
                job_queue_position: job_queue_position,
                current_loss: current_loss,
                validation_loss: validation_loss,
                current_epoch: current_epoch,
            }
        }
    })

    const steps = job_descriptions;

    return (
        <nav aria-label="Progress">
        {is_failed ? (
            // <div>Training Failed</div>
            <div className="
                        border-solid border-2 shadow p-4 rounded-lg
                        flex gap-2
                        
                        border-amber-500  text-zinc-600  bg-zinc-100
                        dark:border-amber-300 dark:text-zinc-300 dark:bg-zinc-800
                        shadow-md
                        ">
                        <div>
                          <ExclamationTriangleIcon className="w-6 mr-2 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex flex-col gap-2">
                        <TextColor className="font-bold">
                            Model training failed
                        </TextColor>
                        <TextColor>
                        We encountered a problem training your model. Please reach out to 
                        <TextLink href="mailto:hello@featrix.ai?subject=Model%20Training%20Failed%20" className="ml-1">
                            hello@featrix.ai
                        </TextLink> for assistance
                        </TextColor>
                          
                        </div>
                      </div>
        ): (
            <>
                <ol role="list" className="overflow-hidden mt-8 mb-16">
                    {/* <pre className="text-slate-500">{JSON.stringify(data, null, 2)}</pre> */}
                    {steps.map((step: any, stepIdx: any) => (
                    // {job_descriptions.map((step, stepIdx) => (
                    <li key={step.name} className={classNames(stepIdx !== steps.length - 1 ? 'pb-10' : '', 'relative')}>
                        {step.status === 'done' ? (
                        <>
                            {stepIdx !== steps.length - 1 ? (
                            <div aria-hidden="true" className="absolute left-4 top-4 -ml-px mt-0.5 h-full w-0.5 bg-indigo-600" />
                            ) : null}
                            <a href={step.href} className="group relative flex items-start">
                            <span className="flex h-9 items-center">
                                <span className="relative z-10 flex size-8 items-center justify-center rounded-full bg-indigo-600 group-hover:bg-indigo-800">
                                <CheckIcon aria-hidden="true" className="size-5 text-white" />
                                </span>
                            </span>
                            <span className="ml-4 flex min-w-0 flex-col">
                                <span className="text-sm font-medium text-gray-500">{step.name}</span>
                                <span className="text-sm text-gray-500">{step.description}</span>
                            </span>
                            </a>
                        </>
                        ) : step.status === 'running' ? (
                        <>
                            {stepIdx !== steps.length - 1 ? (
                            <div aria-hidden="true" className="absolute left-4 top-4 -ml-px mt-0.5 h-full w-0.5 bg-gray-300" />
                            ) : null}
                            <a href={step.href} aria-current="step" className="group relative flex items-start">
                            <span aria-hidden="true" className="flex h-9 items-center">
                                {/* <span className="relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-indigo-600 bg-white"> */}
                                <span className="relative z-10 flex size-8 items-center justify-center rounded-full border-none border-indigo-600 bg-white text-indigo-600">
                                {/* <span className="size-2.5 rounded-full bg-indigo-600" /> */}
                                <Spinner size={32}/>
                                </span>
                            </span>
                            <span className="ml-4 flex min-w-0 flex-col">
                                <span className="text-sm font-medium text-indigo-600">{step.name}</span>
                                <span className="text-sm text-gray-500">{step.description}</span>
                                {/* <span className="text-xs text-gray-500 mt-2 animate-pulse">Running</span> */}
                                { step.progress !== null ? (
                                    <div className="text-xs text-gray-500 mt-2 animate-pulse">
                                        <div>Progress: {(step.progress * 100).toFixed(1)}%</div>
                                        {step.current_epoch && (
                                            <div>Epoch: {step.current_epoch}</div>
                                        )}
                                        {step.current_loss && (
                                            <div>Training Loss: {step.current_loss.toFixed(4)}</div>
                                        )}
                                        {step.validation_loss && (
                                            <div>Validation Loss: {step.validation_loss.toFixed(4)}</div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-500 mt-2 animate-pulse">Running</span>
                                )
                                }
                            </span>
                            </a>
                        </>
                        ) : step.status === 'ready' ? (
                            <>
                                {stepIdx !== steps.length - 1 ? (
                                <div aria-hidden="true" className="absolute left-4 top-4 -ml-px mt-0.5 h-full w-0.5 bg-gray-300" />
                                ) : null}
                                <a href={step.href} aria-current="step" className="group relative flex items-start">
                                <span aria-hidden="true" className="flex h-9 items-center">
                                    <span className="relative z-10 flex size-8 items-center justify-center rounded-full border-none border-indigo-600 bg-white text-indigo-600">
                                    <Spinner size={16}/>
                                    </span>
                                </span>
                                <span className="ml-4 flex min-w-0 flex-col">
                                    <span className="text-sm font-medium text-indigo-600">{step.name}</span>
                                    <span className="text-sm text-gray-500">{step.description}</span>
                                    <span className="text-xs text-gray-500 mt-2 animate-pulse">
                                        Waiting to be scheduled.
                                        {step.job_queue_position !== null && step.job_queue_position !== undefined && (
                                            step.job_queue_position === 0 ? (
                                                " You're next in line."
                                            ) : (
                                                ` You're number ${step.job_queue_position + 1} in line.`
                                            )
                                        )}
                                    </span>
                                </span>
                                </a>
                            </>
                        ) : (
                        <>
                            {stepIdx !== steps.length - 1 ? (
                            <div aria-hidden="true" className="absolute left-4 top-4 -ml-px mt-0.5 h-full w-0.5 bg-gray-300" />
                            ) : null}
                            <a href={step.href} className="group relative flex items-start">
                            <span aria-hidden="true" className="flex h-9 items-center">
                                <span className="relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-gray-300 bg-white group-hover:border-gray-400">
                                <span className="size-2.5 rounded-full bg-transparent group-hover:bg-gray-300" />
                                </span>
                            </span>
                            <span className="ml-4 flex min-w-0 flex-col">
                                <span className="text-sm font-medium text-gray-500">{step.name}</span>
                                <span className="text-sm text-gray-500">{step.description}</span>
                            </span>
                            </a>
                        </>
                        )}
                    </li>
                    ))}

                    

                </ol>
                {
                    <EmailNotification sessionId={session.session_id}/>
                }
            </>
        )}
        </nav>
    )
    }
