using System.Text.Json;
using Microsoft.Identity.Client;
using Microsoft.Identity.Client.Broker;

namespace AttentionHub.GraphCalendarHelper;

internal static class Program
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public static async Task<int> Main()
    {
        HelperResponse response;

        try
        {
            var requestText = await ReadBoundedRequestAsync();
            var request = JsonSerializer.Deserialize<HelperRequest>(requestText, SerializerOptions);
            response = HandleRequest(request);
        }
        catch (RequestTooLargeException)
        {
            response = Error("unknown", "invalidRequest", "The helper request exceeded the protocol size limit.");
        }
        catch (JsonException)
        {
            response = Error("unknown", "invalidRequest", "The helper request was not valid protocol JSON.");
        }
        catch (Exception)
        {
            response = Error("unknown", "error", "The helper could not complete the protocol request.");
        }

        await Console.Out.WriteAsync(JsonSerializer.Serialize(response, SerializerOptions));
        return response.Status is "ready" or "notConfigured" ? 0 : 1;
    }

    private static HelperResponse HandleRequest(HelperRequest? request)
    {
        if (request is null)
        {
            return Error("unknown", "invalidRequest", "The helper request was empty.");
        }

        if (request.ProtocolVersion != Protocol.Version)
        {
            return Error(
                request.Operation ?? "unknown",
                "unsupportedProtocol",
                "The helper protocol version is not supported.");
        }

        return request.Operation switch
        {
            "environment" => InspectEnvironment(request),
            _ => Error(
                request.Operation ?? "unknown",
                "unsupportedOperation",
                "The requested helper operation is not implemented."),
        };
    }

    private static HelperResponse InspectEnvironment(HelperRequest request)
    {
        var clientIdConfigured = IsGuidEnvironmentVariableConfigured(Protocol.ClientIdVariable);
        var tenantIdConfigured = IsGuidEnvironmentVariableConfigured(Protocol.TenantIdVariable);
        var diagnostics = new List<string>();

        if (!clientIdConfigured)
        {
            diagnostics.Add("The Microsoft Graph application client ID is not configured as a valid GUID.");
        }

        if (!tenantIdConfigured)
        {
            diagnostics.Add("The Microsoft Graph tenant ID is not configured as a valid GUID.");
        }

        var windowsSupported = OperatingSystem.IsWindowsVersionAtLeast(10, 0, 17763);
        if (!windowsSupported)
        {
            diagnostics.Add("The helper requires supported Windows 10 or later for WAM.");
        }

        var environment = new HelperEnvironment(
            windowsSupported,
            clientIdConfigured,
            tenantIdConfigured,
            request.ParentWindowHandle is > 0,
            Environment.Version.ToString(),
            AssemblyVersion(typeof(IPublicClientApplication)),
            AssemblyVersion(typeof(BrokerOptions)));
        var ready = windowsSupported && clientIdConfigured && tenantIdConfigured;

        return new HelperResponse(
            Protocol.Version,
            "environment",
            ready ? "ready" : "notConfigured",
            environment,
            diagnostics);
    }

    private static bool IsGuidEnvironmentVariableConfigured(string variableName)
    {
        var value = Environment.GetEnvironmentVariable(variableName);
        return Guid.TryParse(value, out var parsed) && parsed != Guid.Empty;
    }

    private static string AssemblyVersion(Type type) =>
        type.Assembly.GetName().Version?.ToString() ?? "unknown";

    private static HelperResponse Error(string operation, string status, string diagnostic) =>
        new(Protocol.Version, operation, status, null, [diagnostic]);

    private static async Task<string> ReadBoundedRequestAsync()
    {
        var buffer = new char[Protocol.MaximumRequestCharacters + 1];
        var total = 0;

        while (total < buffer.Length)
        {
            var read = await Console.In.ReadAsync(buffer.AsMemory(total, buffer.Length - total));
            if (read == 0)
            {
                return new string(buffer, 0, total);
            }

            total += read;
        }

        throw new RequestTooLargeException();
    }

    private sealed class RequestTooLargeException : Exception;
}
