# India Judiciary Tracker

India Judiciary Tracker is a personal project by Varun Hemachandran. I am not a developer by training. My full-time work is closely tied to the smooth functioning of courts and to expanding access to justice — work I find genuinely meaningful. This project grew out of the frustration of trying to find basic, reliable information about judges, appointments, and declarations across dozens of disconnected official sources.

The first version came together over several days in May 2026, built with AI assistance from [OpenAI Codex](https://openai.com/codex) and [Anthropic Claude](https://claude.ai).

**On accuracy:** This site was built with AI assistance, and AI makes mistakes. So do humans. Both kinds of error are possible here — in the data, in the code, and in the inferences the site draws. We have tried to mitigate this in two ways:

- **Sources are cited wherever possible.** Every judge entry, asset declaration, and appointment date links back to the official source it was drawn from. If something looks wrong, you can check the primary source directly.
- **Where assumptions are made, we say so.** The most significant example is net worth. The tracker estimates a judge's net worth by combining declared monetary holdings with an estimated value for declared gold and silver, based on live international spot rates. We show exactly how that calculation is made, what rates were used, what purity assumptions we applied, and what we excluded — all visible in the tooltip next to every figure. These estimates may not be accurate or representative of a judge's true financial position.

The site tracks publicly available information about courts, sitting judges, court administration, and asset declarations. I update it as sources change or as the data model improves. Coverage is uneven — some courts are fully detailed; others are placeholders. The [GitHub repository](https://github.com/varun-heman/judiciary-tracker) shows the current state of coverage and welcomes contributions.

The code and data are available under the [Apache 2.0 license](https://github.com/varun-heman/judiciary-tracker/blob/main/LICENSE). You are welcome to inspect, reuse, fork, or point out errors. If you quote or rely on anything here, please verify against the underlying official source first.
