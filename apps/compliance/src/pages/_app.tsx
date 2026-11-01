import type { AppProps } from "next/app";
import Head from "next/head";
import { AppFrame } from "@/app/app-frame";
import { AppProviders } from "@/app/providers";
import "@/app/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AppProviders>
      <Head>
        <title>KYC Review Queue · Internal Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <AppFrame>
        <Component {...pageProps} />
      </AppFrame>
    </AppProviders>
  );
}
