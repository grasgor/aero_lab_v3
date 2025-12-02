# aero_lab_v3
A wind tunnel simulation where you design your own spoiler


## Run Locally

Clone the repository
```bash
git clone https://github.com/grasgor/aero_lab_v3.git

cd aero_lab_v3
```


**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
4. If you wish to use it with a local LLM, you can change the local api end point in cloud provider section on the top right.

**Note:** The simulation runs even without the gemini-api, however you will not be able to run simulation analysis.
