import { Schema } from "effect";

const PlatformHostConstantSchema = Schema.Struct({
  localDevelopment: Schema.Literal("platform.localhost"),
});

export const platformHost = Schema.validateSync(PlatformHostConstantSchema)({
  localDevelopment: "platform.localhost",
} satisfies Schema.Schema.Type<typeof PlatformHostConstantSchema>);

export const platformHosts = [platformHost.localDevelopment] as const;

export const PlatformHostSchema = Schema.Literal(...platformHosts);

export type PlatformHost = Schema.Schema.Type<typeof PlatformHostSchema>;
