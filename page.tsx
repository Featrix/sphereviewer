import { useRouter } from 'next/router'


import { Heading } from '@/components/heading'
import { Text, TextLink } from '@/components/text'
import { Button } from '@/components/button'

import Sphere from './sphere'

import { fetch_session_data, fetch_session_projections } from './data_access'

import SphereHeader from './sphere_header'


import type { Metadata, ResolvingMetadata } from 'next'
 
type Props = {
  params: Promise<{ session_id: string }>
}
 
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  // read route params
  const { session_id } = await params
 
  // Example: Fetch data dynamically (replace with actual logic)
  const title = "Featrix Sphere"; 
  const description = "Explore tabular data sets with embeddings.";
  
  return {
    title,
    description,
    openGraph: {
        title,
        description,
        type: "website",
        url: "https://sphere.featrix.com/",
        images: [
            {
                url: `https://sphere-api.featrix.com/compute/session/${session_id}/preview`,

                width: 1200,
                height: 600,
                alt: "Featrix Sphere Preview",
            },
        ],
    },
  };
}


export default async function Page({ params }: Props) {

    const {session_id} = await params;
    const data = await fetch_session_data(session_id);


    return (
        <>
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
                <SphereHeader />

                <Text>
                    We'd love to hear what you think. You can always email us at<TextLink href="mailto:hello@featrix.ai?subject=I%20Love%20Embeddings" className="ml-1">
                    hello@featrix.ai
                    </TextLink>.
                    
                </Text>
                
                <Sphere initial_data={data} />
            </div>
        </div>
        </>
    )
}
