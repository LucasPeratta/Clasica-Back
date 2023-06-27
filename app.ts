import express from "express";
import routes from "./src/routes/index";
const app = express();
import cors from "cors";

const port = process.env.PORT;

//PORT
app.set("port", port);

const corsOptions = {
  origin: "*",
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));

//routes
app.use("/api", routes);

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
