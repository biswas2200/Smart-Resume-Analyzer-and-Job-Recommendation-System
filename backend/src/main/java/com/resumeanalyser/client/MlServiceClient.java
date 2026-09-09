package com.resumeanalyser.client;

import com.resumeanalyser.client.dto.AnalyzeResponseDto;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Typed HTTP client wrapping calls to the ML service (see
 * {@code ml-service/app/routers/upload.py}). Only wraps {@code /analyze-file}
 * today, since that's the one call the rest of the backend actually needs --
 * a single round trip covering parsing, ATS scoring, role matching, gap
 * analysis, and explanation for an uploaded resume file.
 */
@Component
public class MlServiceClient {

    private final RestClient restClient;

    public MlServiceClient(RestClient mlServiceRestClient) {
        this.restClient = mlServiceRestClient;
    }

    /**
     * Runs the full resume analysis pipeline on an uploaded file's raw bytes.
     *
     * @param fileBytes the resume file's raw bytes, as received from the client
     * @param filename  the original filename, used by the ML service to pick a
     *                  text extractor by extension (PDF today; see
     *                  {@code document_extraction/registry.py})
     * @param topN      how many top-matched roles to return
     * @return the parsed profile, ATS score, role matches, skill gaps, and explanation
     * @throws MlServiceException if the ML service is unreachable, or rejects the
     *                            request (e.g. an unsupported file format --
     *                            see {@link MlServiceException#isUnsupportedFileType()})
     */
    public AnalyzeResponseDto analyzeFile(byte[] fileBytes, String filename, int topN) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("file", new ByteArrayResource(fileBytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        });

        try {
            return restClient.post()
                    .uri(uriBuilder -> uriBuilder.path("/analyze-file").queryParam("top_n", topN).build())
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(builder.build())
                    .retrieve()
                    .body(AnalyzeResponseDto.class);
        } catch (HttpClientErrorException e) {
            boolean unsupportedFileType = e.getStatusCode() == HttpStatus.UNSUPPORTED_MEDIA_TYPE;
            throw new MlServiceException(
                    unsupportedFileType
                            ? "This resume file format isn't supported yet"
                            : "The ML service rejected the request (" + e.getStatusCode() + ")",
                    unsupportedFileType,
                    e);
        } catch (ResourceAccessException e) {
            throw new MlServiceException("Could not reach the ML service", false, e);
        } catch (RestClientException e) {
            throw new MlServiceException("The ML service call failed", false, e);
        }
    }
}
