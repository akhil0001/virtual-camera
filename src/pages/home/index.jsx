import { useMachine } from "@xstate/react";
import { FlowMachine } from "../../state/FlowMachine";
import { Button, Image, Stack, Text, Title } from "@mantine/core";
import { pick } from "lodash";

export const Home = () => {
  const [state, send] = useMachine(FlowMachine);
  const onFetch = () => send("FETCH");
  const {
    date,
    location,
    nearbyPlaces,
    weather,
    temperature,
    viewOfPhoto,
    prompt,
    imageURLs,
  } = state.context;
  const { lat, long } = pick(location, ["lat", "long"]);
  const isLoading = state.matches("fetching");
  return (
    <Stack align="center">
      <Title>Home</Title>
      <Text>Date: {date}</Text>
      <Text>
        Location: Lat: {lat} Long: {long}
      </Text>
      <Text>Nearby Places: {nearbyPlaces}</Text>
      <Text>Weather: {weather}</Text>
      <Text>Temperature: {temperature}</Text>
      <Text>View: {viewOfPhoto}</Text>
      <Button loading={isLoading} onClick={onFetch}>
        Fetch
      </Button>
      {prompt && <Text>Prompt: {prompt}</Text>}
      {imageURLs.length > 0 &&
        imageURLs.map((el, i) => (
          <Image
            key={i}
            src={`data:image/png;base64,${el}`}
            alt={prompt}
            width={512}
            height={512}
          />
        ))}
    </Stack>
  );
};
