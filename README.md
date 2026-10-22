<a href="https://usegloss.io">
  <img alt="Gloss" src="./public/og.png">
  <h1 align="center">Gloss</h1>
</a>

<p align="center">
  An open source AI reader for articles and PDFs. Select any line, ask a question, and get a cited answer in the margin. Powered by Together.ai.
</p>

## Tech stack

- [DeepSeek V4.1 Flash](https://togetherai.link/?utm_source=gloss&utm_medium=referral&utm_campaign=example-app) and Kimi K3 for the LLMs
- [Together AI](https://togetherai.link/?utm_source=gloss&utm_medium=referral&utm_campaign=example-app) for LLM inference
- [Exa](https://exa.ai) for web search
- [LiteParse](https://github.com/run-llama/liteparse) for in-browser PDF parsing, with Qwen on Together for scanned pages
- [Clerk](https://clerk.com) for optional auth and [Neon](https://neon.tech) for syncing your library
- Google Translate's and Baidu Translate's own voices for the read-aloud sentence — no key, no account
- Next.js app router with Tailwind

## Reading aloud

Two voices, for two different things:

- **The whole text**, from the top bar, is Together's Cartesia (Sonic 3). It needs a key, because a minute of voice costs more than a day of free answers.
- **A highlighted sentence**, from the lens beside the highlighter, is free: it goes through `/api/voice`, which needs no key and no account.

The sentence is played with the Web Audio API rather than a media element: a media element is a subresource load and has to pass the page's `media-src`, while the clip is decoded straight into the audio context. The context is made inside the click that asked for the words, because Chrome leaves one made later suspended, and the clip is connected to the destination, or it plays to nowhere in silence.

The browser cannot call either voice directly — the answers carry no CORS header — so `/api/voice` makes the request on the server. It checks the content-type, because a rate-limited request comes back as `200` with a page of HTML rather than a clip. The same words are asked for once and kept, since the endpoint rate-limits hard.

**Two voices, in order.** Google's is asked first, because it is the better one and it speaks every language. Baidu's answers instead when Google cannot be reached at all, or when it is too busy to answer — it speaks Chinese, English, Japanese and Korean, and refuses the rest. Google is left alone for five minutes after a failed try, so one dead route does not make every sentence wait out the same timeout. Every refusal carries a name (`unreachable`, `timeout`, `busy`, `refused`), and the browser says which one it was in the reader's own language.

**No proxy in the code.** Where the network cannot reach Google, the proxy is the machine's business, not the app's: Node does that on its own, and only if it is told to at startup.

```
HTTPS_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 npm run dev
```

`NODE_USE_ENV_PROXY` has to be set before the process starts — Node reads it once, when it decides how to send its requests — so it cannot live in `.env.local`, which is read afterwards. With it, every server-side request (both voices, Together, the web search) goes through that proxy, and the Baidu fallback is only there for when the proxy is not running.


## Languages

Gloss reads in English and Chinese, and every page lives under a language: `/en/library`, `/zh/library`.

- `lib/i18n/config.ts` — the languages Gloss speaks, their tags, and the cookie the reader's choice is kept in
- `lib/i18n/dictionaries/*.json` — the words, one file per language
- `lib/i18n/negotiate.ts` — reads the browser's `Accept-Language` header and picks a language
- `lib/i18n/format.ts` — dates, numbers and durations, written the way the language writes them
- `lib/i18n/paths.ts` — building and rewriting paths in a language
- `lib/i18n/translate.ts` — looking a string up, with its words filled in and its plural form chosen

The proxy sends a reader with no language in the path to the one their browser asks for, and remembers it in a cookie, so the next visit opens in the same language. The picker in the top bar changes it at any time.

**Adding a language:** add its code to `LOCALES` in `lib/i18n/config.ts`, add its tag and name to `LOCALE_TAGS` and `LOCALE_NAMES`, and add `lib/i18n/dictionaries/<code>.json` with the same keys as `en.json`. The tests will tell you if a key is missing or spelled differently.

**Using it:** in a client component, `const { t, path } = useI18n()`. `t("nav.library")` gives the string; `path("/library")` gives `/zh/library`. In a server component, `await getTranslations()` gives the dictionary.

## Tests

```
npm test          # unit tests, once
npm run test:watch
```

The suite covers the language layer: negotiation, paths, formatting, the dictionaries (every language has the same words), and the React provider and picker. It also covers the voice: the language a passage is read in, the request `/api/voice` makes, that the clip is connected to the audio context — a clip that is not connected plays in silence, with no error to show for it — and that a voice which never answers is given up on rather than waited for.

## Cloning & running

1. Clone the repo: `git clone https://github.com/Nutlope/gloss`
2. Create a `.env.local` file (use `.env.example` for reference) and add your API keys:
   - **[Together AI API key](https://togetherai.link/?utm_source=gloss&utm_medium=referral&utm_campaign=example-app)**: `TOGETHER_API_KEY=`
   - **Database URL** from [Neon](https://neon.tech): `DATABASE_URL=`
   - **Clerk keys** from [Clerk](https://clerk.com): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=` and `CLERK_SECRET_KEY=`
   - **Exa API key** (optional, for web search): `EXA_API_KEY=`
3. Run `npm install` and `npm run db:migrate` to install dependencies and create the tables
4. Run `npm run dev` and open http://localhost:3100

## Future Tasks

- [ ] Ship it as a browser extension that opens the same margin on any page
- [ ] Let a gloss compare two passages you pick at once
- [ ] Move the shared-key rate limit to a store like Upstash so it holds across instances
