'use client'

import { copyURL } from './copy_url'

import { Heading } from '@/components/heading'
import { Button } from '@/components/button'

import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline'

export default function SphereHeader() {

    return (
        <div className="flex w-full flex-wrap items-end justify-between gap-4 border-b border-zinc-950/10 pb-6 dark:border-white/10">
            <Heading>You are now entering the sphere...</Heading>
            <div className="flex gap-4">
                <Button outline
                    onClick={() => copyURL({
                        success_msg: "URL copied to clipboard!",
                        error_msg: "Ooops! Something went wrong. Please try again."
                    })}
                >
                    <div className="flex items-center gap-2 text-gray-600">
                        <ArrowUpOnSquareIcon className="text-gray-400 w-5 h-5 -translate-y-0.5" />
                        Share
                    </div>
                </Button>
                {/* <Button>Resend invoice</Button> */}
            </div>
        </div>
    )
}