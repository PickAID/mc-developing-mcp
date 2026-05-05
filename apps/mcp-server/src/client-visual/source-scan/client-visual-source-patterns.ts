import type { ClientVisualSourceEvidenceKind } from "./client-visual-source-scanner.js";

export type ClientVisualPatternKind = Exclude<
  ClientVisualSourceEvidenceKind,
  "resourceLocationReferences"
>;

export interface ClientVisualSourcePattern {
  symbol: string;
  pattern: RegExp;
}

export const CLIENT_VISUAL_SOURCE_PATTERNS: Record<
  ClientVisualPatternKind,
  ReadonlyArray<ClientVisualSourcePattern>
> = {
  candidateRegistries: [
    { symbol: "DeferredRegister", pattern: /\bDeferredRegister\b/ },
    { symbol: "RegistryObject", pattern: /\bRegistryObject\b/ },
    { symbol: "DeferredHolder", pattern: /\bDeferredHolder\b/ },
    { symbol: "StartupEvents.registry", pattern: /\bStartupEvents\.registry\b/ }
  ],
  candidateClientInit: [
    { symbol: "FMLClientSetupEvent", pattern: /\bFMLClientSetupEvent\b/ },
    { symbol: "ClientModInitializer", pattern: /\bClientModInitializer\b/ },
    { symbol: "Dist.CLIENT", pattern: /\bDist\.CLIENT\b/ },
    { symbol: "ClientEvents.init", pattern: /\bClientEvents\.init\b/ },
    { symbol: "RegisterClient", pattern: /\bRegisterClient\b/ }
  ],
  candidateRendererBindings: [
    { symbol: "registerBlockEntityRenderer", pattern: /\bregisterBlockEntityRenderer\b/ },
    { symbol: "BlockEntityRenderers.register", pattern: /\bBlockEntityRenderers\.register\b/ },
    { symbol: "EntityRenderers.register", pattern: /\bEntityRenderers\.register\b/ },
    { symbol: "registerEntityRenderer", pattern: /\bregisterEntityRenderer\b/ },
    { symbol: "EntityRendererRegistry.register", pattern: /\bEntityRendererRegistry\.register\b/ }
  ],
  candidateScreenRegistrations: [
    { symbol: "MenuScreens.register", pattern: /\bMenuScreens\.register\b/ },
    { symbol: "ScreenRegistry.register", pattern: /\bScreenRegistry\.register\b/ },
    { symbol: "HandledScreens.register", pattern: /\bHandledScreens\.register\b/ }
  ],
  candidateModelLayerRegistrations: [
    { symbol: "RegisterLayerDefinitions", pattern: /\bRegisterLayerDefinitions\b/ },
    { symbol: "registerLayerDefinition", pattern: /\bregisterLayerDefinition\b/ },
    { symbol: "ModelLayerLocation", pattern: /\bModelLayerLocation\b/ },
    {
      symbol: "EntityModelLayerRegistry.registerModelLayer",
      pattern: /\bEntityModelLayerRegistry\.registerModelLayer\b/
    },
    { symbol: "RegisterGeometryLoaders", pattern: /\bRegisterGeometryLoaders\b/ },
    { symbol: "BakedModel", pattern: /\bBakedModel\b/ },
    { symbol: "GeometryLoader", pattern: /\bGeometryLoader\b/ }
  ],
  kubeJsClientHooks: [
    { symbol: "ClientEvents", pattern: /\bClientEvents\./ },
    { symbol: "ItemEvents.client", pattern: /\bItemEvents\.client\b/ }
  ],
  dynamicTextureHints: [
    { symbol: "DynamicTexture", pattern: /\bDynamicTexture\b/ },
    { symbol: "NativeImage", pattern: /\bNativeImage\b/ },
    { symbol: "TextureManager.register", pattern: /\bTextureManager\b[\s\S]{0,80}\.register\b/ },
    { symbol: "upload", pattern: /\.upload\s*\(/ },
    { symbol: "RenderTarget", pattern: /\bRenderTarget\b/ }
  ],
  resourceReloadHooks: [
    { symbol: "ResourceManagerReloadListener", pattern: /\bResourceManagerReloadListener\b/ },
    { symbol: "PreparableReloadListener", pattern: /\bPreparableReloadListener\b/ },
    { symbol: "RegisterClientReloadListenersEvent", pattern: /\bRegisterClientReloadListenersEvent\b/ },
    { symbol: "AddReloadListenerEvent", pattern: /\bAddReloadListenerEvent\b/ },
    { symbol: "IdentifiableResourceReloadListener", pattern: /\bIdentifiableResourceReloadListener\b/ }
  ],
  networkSyncHints: [
    { symbol: "sendToServer", pattern: /\bsendToServer\s*\(/ },
    { symbol: "PacketDistributor", pattern: /\bPacketDistributor\b/ },
    { symbol: "CustomPacketPayload", pattern: /\bCustomPacketPayload\b/ },
    { symbol: "SimpleChannel", pattern: /\bSimpleChannel\b/ },
    { symbol: "SynchedEntityData", pattern: /\bSynchedEntityData\b/ },
    { symbol: "EntityDataAccessor", pattern: /\bEntityDataAccessor\b/ },
    { symbol: "DataSlot", pattern: /\bDataSlot\b/ },
    { symbol: "sync", pattern: /\bsync(?:hronise|hronize)?\s*\(/ }
  ],
  animationStateHints: [
    { symbol: "Mth.lerp", pattern: /\bMth\.lerp\s*\(/ },
    { symbol: "LerpedFloat", pattern: /\bLerpedFloat\b/ },
    { symbol: "partialTick", pattern: /\bpartialTicks?\b/ },
    { symbol: "AnimationState", pattern: /\bAnimationState\b/ },
    { symbol: "previous/current state", pattern: /\bprev(?:ious)?[A-Z]\w*\b.{0,120}\b(?:current|angle|yaw|pitch|state)\w*\b/i },
    { symbol: "Quaternion interpolation", pattern: /\.(?:slerp|nlerp)\s*\(/ }
  ],
  uiLayoutHints: [
    { symbol: "GuiGraphics.blit", pattern: /\bGuiGraphics\b[\s\S]{0,300}\.blit\s*\(/ },
    { symbol: "addRenderableWidget", pattern: /\baddRenderableWidget\s*\(/ },
    { symbol: "leftPos/topPos", pattern: /\b(?:leftPos|topPos|imageWidth|imageHeight)\b/ },
    { symbol: "Screen.render", pattern: /\bclass\s+\w+\s+extends\s+Screen\b/ }
  ],
  renderPipelineHints: [
    { symbol: "RenderSystem", pattern: /\bRenderSystem\./ },
    { symbol: "MultiBufferSource", pattern: /\bMultiBufferSource\b/ },
    { symbol: "PoseStack", pattern: /\bPoseStack\b/ },
    { symbol: "RenderType", pattern: /\bRenderType\./ },
    { symbol: "VertexConsumer", pattern: /\bVertexConsumer\b/ }
  ],
  shaderPipelineHints: [
    { symbol: "PostChain", pattern: /\bPostChain\b/ },
    { symbol: "ShaderInstance", pattern: /\bShaderInstance\b/ },
    { symbol: "EffectInstance", pattern: /\bEffectInstance\b/ },
    { symbol: "rendertype_", pattern: /["']rendertype_[a-z0-9_./-]+["']/ },
    { symbol: "core shader json", pattern: /assets\/minecraft\/shaders\/(?:core|post)\// }
  ],
  renderPerformanceRisks: [
    { symbol: "new DynamicTexture", pattern: /\bnew\s+DynamicTexture\b/ },
    { symbol: "render file IO", pattern: /\brender\w*\s*\([^)]*\)\s*\{[\s\S]{0,500}\b(?:readFile|Files\.|Path\.of)\b/ },
    { symbol: "render JSON parse", pattern: /\brender\w*\s*\([^)]*\)\s*\{[\s\S]{0,500}\b(?:Gson|JsonParser|parse)\b/ },
    { symbol: "render network send", pattern: /\brender\w*\s*\([^)]*\)\s*\{[\s\S]{0,500}\bsendToServer\s*\(/ },
    { symbol: "render texture upload", pattern: /\brender\w*\s*\([^)]*\)\s*\{[\s\S]{0,500}\.upload\s*\(/ }
  ]
};
