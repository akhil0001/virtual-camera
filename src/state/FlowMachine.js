import { first, get, isEmpty, pick } from "lodash";
import { assign, createMachine } from "xstate";

const getTimeString = (hour) =>
  hour > 0 && hour < 12
    ? "morning"
    : hour >= 12 && hour < 15
    ? "afternoon"
    : hour >= 15 && hour < 19
    ? "evening"
    : "night";

const getDayStr = (date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);

export const FlowMachine = createMachine(
  {
    initial: "idle",
    context: {
      date: "",
      location: {
        lat: "48.8584",
        long: "2.2945",
      },
      locationData: {},
      nearbyPlaces: "",
      weather: "",
      temperature: "",
      viewOfPhoto: "",
      error: null,
      prompt: "",
      negativePrompt: "",
      placeName: "",
      imageURLs: [],
    },
    states: {
      idle: {
        id: "idle",
        on: {
          FETCH: {
            target: "fetching",
          },
        },
      },
      fetching: {
        initial: "fetchingDate",
        states: {
          fetchingDate: {
            entry: ["setContextualDate"],
            after: {
              100: "fetchingNameOfLocation",
            },
          },
          fetchingLocation: {
            invoke: {
              src: "fetchLocationFromBrowser",
            },
            on: {
              ERROR: {
                target: "#error",
                actions: ["setError"],
              },
              LOCATION_IDENTIFIED: {
                target: "fetchingNameOfLocation",
                actions: ["setLocation"],
              },
            },
          },
          fetchingNameOfLocation: {
            invoke: {
              src: "fetchNameOfLocation",
              onDone: {
                target: "fetchingNearByPlaces",
                actions: ["setLocationData"],
              },
              onError: {
                target: "#error",
                actions: ["setError"], //TODO: This should be enhanced to fit the message format
              },
            },
          },
          fetchingNearByPlaces: {
            invoke: {
              src: "fetchNearByPlaces",
              onDone: {
                target: "fetchingWeather",
                actions: ["setNearByPlaces"],
              },
            },
          },
          fetchingWeather: {
            invoke: {
              src: "fetchWeather",
              onDone: {
                target: "generatingAPrompt",
                actions: ["setWeather", "setTemperature"],
              },
            },
          },
          generatingAPrompt: {
            invoke: {
              src: "generateStableDiffusionPrompt",
            },
            on: {
              SUCCESS: {
                target: "fetchingImage",
                actions: ["setPrompt"],
              },
            },
          },
          fetchingImage: {
            invoke: {
              src: "fetchImage",
              onDone: {
                target: "#idle",
                actions: ["setImageUrls"],
              },
            },
          },
        },
      },
      error: {
        id: "error",
      },
    },
  },
  {
    services: {
      fetchLocationFromBrowser: () => (callback) => {
        if (!navigator.geolocation) {
          callback({
            type: "ERROR",
            data: {
              message: "Browser does not support fetching geo location",
              code: "BROWSER_NOT_SUPP",
            },
          });
        }
        const successCb = (pos) =>
          callback({
            type: "LOCATION_IDENTIFIED",
            data: {
              lat: pos.coords.latitude,
              long: pos.coords.longitude,
            },
          });
        const errorCb = () =>
          callback({
            type: "ERROR",
            data: {
              message: "User denied permission to use Location",
              code: "USER_DENIED",
            },
          });
        navigator.geolocation.getCurrentPosition(successCb, errorCb);
      },
      fetchNameOfLocation: (context) => {
        const { lat, long } = context.location;
        return fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${long}&format=json`
        ).then((res) => res.json());
      },
      fetchNearByPlaces: (context) => {
        const { location } = context;
        const { lat, long } = location;
        return fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${long},${lat}.json?types=poi&access_token=${
            import.meta.env.VITE_MAPBOX_KEY
          }`
        ).then((res) => res.json());
      },
      fetchWeather: (context) => {
        const { location } = context;
        const { lat, long } = location;
        return fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${long}&appid=${
            import.meta.env.VITE_OPEN_WEATHER_KEY
          }&units=metric`
        ).then((res) => res.json());
      },
      generateStableDiffusionPrompt: (context) => (callback) => {
        const { date, locationData, nearbyPlaces, weather, temperature } =
          context;
        const timeOfDay = new Date(date).getHours();
        const timeStr = getTimeString(timeOfDay);
        const prompt = `A colorful photo taken during ${timeStr} at ${
          locationData.display_name
        }. The weather is ${weather} with temperature of ${Math.round(
          temperature
        )} degrees. The day is ${getDayStr(
          new Date(date)
        )}. Near by places are ${nearbyPlaces}. highly detailed face, depth of field,  golden hour, style by Dan Winters, Russell James, Steve McCurry, centered, extremely detailed, Nikon D850, award winning photography`;
        callback({
          type: "SUCCESS",
          data: {
            prompt: prompt,
          },
        });
      },
      fetchImage: (context) => {
        const { prompt } = context;
        return fetch(
          "https://api.stability.ai/v1/generation/stable-diffusion-xl-beta-v2-2-2/text-to-image",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_STABILITY_AI_KEY}`,
            },
            body: JSON.stringify({
              text_prompts: [
                {
                  text: prompt,
                },
              ],
              cfg_scale: 7,
              clip_guidance_preset: "FAST_BLUE",
              height: 512,
              width: 512,
              samples: 1,
              steps: 30,
            }),
          }
        ).then((res) => res.json());
      },
    },
    actions: {
      setContextualDate: assign({
        date: (context) => {
          return isEmpty(context.date) ? new Date().toString() : context.date;
        },
      }),
      setError: assign({
        error: (_, event) => event?.data?.message,
      }),
      setLocation: assign({
        location: (_, event) => event?.data,
      }),
      setLocationData: assign({
        locationData: (_, event) => pick(event?.data, ["display_name"]),
      }),
      setNearByPlaces: assign({
        nearbyPlaces: (_, event) => {
          const res = event.data;
          const { features } = res;
          const result = features
            .map((el) => first(get(el, "properties.category").split(",")))
            .join(",");
          return result;
        },
      }),
      setWeather: assign({
        weather: (_, event) => {
          const response = event?.data;
          const description = get(response, "weather[0].description", "");
          return description;
        },
      }),
      setTemperature: assign({
        temperature: (_, event) => {
          const response = event?.data;
          const temperature = get(response, "main.temp", 30);
          return temperature;
        },
      }),
      setPrompt: assign({
        prompt: (_, event) => event?.data?.prompt,
      }),
      setImageUrls: assign({
        imageURLs: (_, event) => event?.data?.artifacts.map((el) => el?.base64),
      }),
    },
  }
);
