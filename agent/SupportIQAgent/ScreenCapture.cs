using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace SupportIQ.Agent
{
    public class CapturedFrame
    {
        public byte[] Jpeg;
        public int Width;
        public int Height;
    }

    /// <summary>Captures the full virtual desktop and encodes a scaled JPEG.</summary>
    public static class ScreenCapture
    {
        public static CapturedFrame Capture(int maxWidth, long quality)
        {
            Rectangle bounds = SystemInformation.VirtualScreen;
            if (bounds.Width <= 0 || bounds.Height <= 0)
            {
                throw new InvalidOperationException("The desktop size could not be read.");
            }

            int outputWidth = bounds.Width;
            int outputHeight = bounds.Height;
            if (bounds.Width > maxWidth)
            {
                outputWidth = maxWidth;
                outputHeight = Math.Max(1, (int)Math.Round(bounds.Height * (maxWidth / (double)bounds.Width)));
            }

            using (Bitmap full = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb))
            {
                using (Graphics graphics = Graphics.FromImage(full))
                {
                    graphics.CopyFromScreen(
                        bounds.Left,
                        bounds.Top,
                        0,
                        0,
                        new Size(bounds.Width, bounds.Height),
                        CopyPixelOperation.SourceCopy);
                }

                Bitmap output = full;
                try
                {
                    if (outputWidth != bounds.Width || outputHeight != bounds.Height)
                    {
                        output = new Bitmap(outputWidth, outputHeight, PixelFormat.Format24bppRgb);
                        using (Graphics scaled = Graphics.FromImage(output))
                        {
                            scaled.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
                            scaled.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighSpeed;
                            scaled.DrawImage(full, 0, 0, outputWidth, outputHeight);
                        }
                    }

                    using (MemoryStream stream = new MemoryStream())
                    {
                        ImageCodecInfo encoder = FindJpegEncoder();
                        EncoderParameters parameters = new EncoderParameters(1);
                        parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                        output.Save(stream, encoder, parameters);

                        CapturedFrame frame = new CapturedFrame();
                        frame.Jpeg = stream.ToArray();
                        frame.Width = outputWidth;
                        frame.Height = outputHeight;
                        return frame;
                    }
                }
                finally
                {
                    if (output != full) output.Dispose();
                }
            }
        }

        private static ImageCodecInfo FindJpegEncoder()
        {
            foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
            {
                if (codec.FormatID == ImageFormat.Jpeg.Guid) return codec;
            }
            throw new InvalidOperationException("No JPEG encoder is available.");
        }
    }
}
