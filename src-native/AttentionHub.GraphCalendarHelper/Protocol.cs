using System.Text.Json.Serialization;

namespace AttentionHub.GraphCalendarHelper;

internal static class Protocol
{
    internal const int Version = 1;
    internal const int MaximumRequestCharacters = 16_384;
    internal const string ClientIdVariable = "ATTENTION_HUB_GRAPH_CLIENT_ID";
    internal const string TenantIdVariable = "ATTENTION_HUB_GRAPH_TENANT_ID";
}

internal sealed record HelperRequest(
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("operation")] string? Operation,
    [property: JsonPropertyName("parentWindowHandle")] long? ParentWindowHandle);

internal sealed record HelperResponse(
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("operation")] string Operation,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("environment")] HelperEnvironment? Environment,
    [property: JsonPropertyName("diagnostics")] IReadOnlyList<string> Diagnostics);

internal sealed record HelperEnvironment(
    [property: JsonPropertyName("windowsSupported")] bool WindowsSupported,
    [property: JsonPropertyName("clientIdConfigured")] bool ClientIdConfigured,
    [property: JsonPropertyName("tenantIdConfigured")] bool TenantIdConfigured,
    [property: JsonPropertyName("parentWindowHandleProvided")] bool ParentWindowHandleProvided,
    [property: JsonPropertyName("dotnetRuntimeVersion")] string DotnetRuntimeVersion,
    [property: JsonPropertyName("msalVersion")] string MsalVersion,
    [property: JsonPropertyName("brokerVersion")] string BrokerVersion);
