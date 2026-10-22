<a href="https://usegloss.io">
  <img alt="Gloss" src="./public/og.png">
  <h1 align="center">Gloss</h1>
</a>

<p align="center">
  An open source AI reader for articles and PDFs. Select any line, ask a question, and get a cited answer in the margin. Powered by OpenRouter.
</p>

## Tech stack

- [OpenRouter](https://openrouter.ai) for LLM inference, on the free models it serves
- The reader picks the models, in order: the first one answers, the ones behind it are fallbacks
- [Exa](https://exa.ai) for web search
- [LiteParse](https://github.com/run-llama/liteparse) for in-browser PDF parsing, with a free vision model on OpenRouter for scanned pages
- [Clerk](https://clerk.com) for optional auth and [Neon](https://neon.tech) for syncing your library
- Google Translate's and Baidu Translate's own voices for reading aloud — no key, no account
- Next.js app router with Tailwind

## Models

There is no fixed list of models any more: OpenRouter serves hundreds, and the free ones change from week to week. `lib/openrouter.ts` fetches the catalogue (`/api/v1/models`), keeps it for half an hour, and leaves through the ones that cost nothing to ask. `app/api/models` hands the free ones to the browser.

The reader chooses in **Settings → Answers**. Every free model is listed there, and none of them is ticked to begin with: the reader ticks the ones they want, and drags them into the order they want them in. The first ticked model is the one that answers; the ones below it are fallbacks, asked when the one before cannot (it is rate limited, or gone from the list). A model that has started answering is left to finish. Until something is ticked, the recommended models answer instead.

Only free models are let through, on the server as well as in the browser: the shared key pays for the answers, and a paid model on it would be paid for out of the owner's pocket.

**The models are told how much to think.** Reasoning tokens come out of the same budget as the answer, and most models think by default: OpenRouter reports which ones do, and how hard. Left to itself, a model spends four fifths of the budget thinking and writes nothing at all. A gloss is two or three sentences, so the model is told to think only where it has to, and as little as it can: `none` where it can answer without thinking, the cheapest effort where it has to.

**The chain keeps its order, and it says what it did.** A model that is rate limited, gone from the list, or thinking out loud without saying anything is passed over and the next one is asked. The answer carries the name of the model that answered, and the ones the reader chose that could not answer, with the reason — so the receipt never quietly answers from somewhere else.

## A reader's own key

A reader can paste their own OpenRouter key, and it stays in their browser. The server needs it to make their calls, so it travels with every request — but never in the clear: the browser seals it with the server's public key (ECDH over P-256, then AES-256-GCM), and only the server can open it. What sits in the network tab is a sealed key, not the key.

The keypair comes from a secret, so every instance of the app opens the same seals: `API_KEY_SECRET` if it is set, else a secret kept in the `secrets` table (run `npm run db:migrate`), else one derived from the database's own address. **Set `API_KEY_SECRET` before deploying**: it is the one that says which secret is yours, and the one to change when you want the old seals to stop working.

## Reading aloud

One voice, for two things: the whole text from the top bar, and a highlighted sentence from the lens beside the highlighter. Both are Google Translate's own voice, which needs no key and no account. Where Google cannot be reached at all, Baidu Translate's answers instead — it speaks Chinese, English, Japanese and Korean, and refuses the rest.

The sentence is played with the Web Audio API rather than a media element: a media element is a subresource load and has to pass the page's `media-src`, while the clip is decoded straight into the audio context. The context is made inside the click that asked for the words, because Chrome leaves one made later suspended, and the clip is connected to the destination, or it plays to nowhere in silence.

The browser cannot call either voice directly — the answers carry no CORS header — so `/api/voice` and `/api/speak` make the request on the server. They check the content-type, because a rate-limited request comes back as `200` with a page of HTML rather than a clip. The same words are asked for once and kept, since the endpoint rate-limits hard.

**Two voices, in order.** Google's is asked first, because it is the better one and it speaks every language. Baidu's answers instead when Google cannot be reached at all, or when it is too busy to answer. Google is left alone for five minutes after a failed try, so one dead route does not make every sentence wait out the same timeout. Every refusal carries a name (`unreachable`, `timeout`, `busy`, `refused`), and the browser says which one it was in the reader's own language.

**No proxy in the code.** Where the network cannot reach Google, the proxy is the machine's business, not the app's: Node does that on its own, and only if it is told to at startup.

```
HTTPS_PROXY=http://127.0.0.1:7897 NODE_USE_ENV_PROXY=1 npm run dev
```

`NODE_USE_ENV_PROXY` has to be set before the process starts — Node reads it once, when it decides how to send its requests — so it cannot live in `.env.local`, which is read afterwards. With it, every server-side request (both voices, OpenRouter, the web search) goes through that proxy, and the Baidu fallback is only there for when the proxy is not running.


## Languages

Gloss reads in English and Chinese, and every page lives under a language: `/en/library`, `/zh/library`.

- `lib/i18n/config.ts` — the languages Gloss speaks, their tags, and the cookie the reader's choice is kept in
- `lib/i18n/dictionaries/*.json` — the words, one file per language
- `lib/i18n/negotiate.ts` — reads the browser's `Accept-Language` header and picks a language
- `lib/i18n/format.ts` — dates, numbers and durations, written the way the language writes them
- `lib/i18n/paths.ts` — building and rewriting paths in a language
- `lib/i18n/translate.ts` — looking a string up, with its words filled in and its plural form chosen
- `lib/i18n/request.ts` — the language of a request that arrives at the API

The proxy sends a reader with no language in the path to the one their browser asks for, and remembers it in a cookie, so the next visit opens in the same language. The picker in the top bar changes it at any time.

**The answers are written in the reader's language.** A Chinese reader gets a Chinese gloss; an English reader gets an English one, whatever language their question was in. The prompt itself stays in English, so one set of words serves every reader and the cached prefix is the same for all of them: only the language of the answer is added, and it goes after the text, in `lib/prompts.ts`. The browser says which language it is in the body of the request, and the API falls back to the cookie when it says nothing.

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
   - **[OpenRouter API key](https://openrouter.ai/settings/keys)**: `OPENROUTER_API_KEY=`
   - **The secret that seals a reader's own key**: `API_KEY_SECRET=` (any string, the same on every instance)
   - **Database URL** from [Neon](https://neon.tech): `DATABASE_URL=`
   - **Clerk keys** from [Clerk](https://clerk.com): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=` and `CLERK_SECRET_KEY=`
   - **Exa API key** (optional, for web search): `EXA_API_KEY=`
3. Run `npm install` and `npm run db:migrate` to install dependencies and create the tables
4. Run `npm run dev` and open http://localhost:3100

## Future Tasks

- [ ] Ship it as a browser extension that opens the same margin on any page
- [ ] Let a gloss compare two passages you pick at once
- [ ] Move the shared-key rate limit to a store like Upstash so it holds across instances
